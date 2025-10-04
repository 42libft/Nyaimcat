# src/esclbot/scraper.py
from __future__ import annotations

import re
from typing import List, Tuple, Optional

from bs4 import BeautifulSoup


def guess_scrim_id(url: Optional[str]) -> Optional[str]:
    """親URLから scrim_id をざっくり抜く（ファイル名用の識別子）。"""
    if not url:
        return None
    m = re.search(r"/scrims/([0-9a-f\-]{8,})", url)
    return m.group(1) if m else None


def collect_game_texts_from_group(group_url: str, max_games: int = 6) -> List[Tuple[int, str]]:
    """
    同期API：グループのページ（タブUI）から GAME 1..max_games の
    『詳細な試合結果をコピー』テキストを順に取得して返す。
    戻り値: [(game_no, text), ...]
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        # Playwright が未導入なら空で返す
        return []

    results: List[Tuple[int, str]] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # モバイル幅だとDOM構造が変わるので広めのビューポートで固定
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (ESCL Collector Bot)"
        )
        page = ctx.new_page()

        page.goto(group_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)  # 初期待機

        for i in range(1, max_games + 1):
            # --- GAME i のタブをクリック（MUIの role=tab を優先） ---
            clicked = False
            candidates = [
                lambda: page.get_by_role("tab", name=re.compile(rf"^GAME\s*{i}\b", re.I)).first.click(timeout=1500),
                lambda: page.get_by_text(re.compile(rf"^GAME\s*{i}\b", re.I)).first.click(timeout=1500),
                lambda: page.locator(f"text=GAME {i}").first.click(timeout=1500),
                lambda: page.locator(f"text=GAME{i}").first.click(timeout=1500),
            ]
            for fn in candidates:
                try:
                    fn()
                    clicked = True
                    break
                except Exception:
                    continue
            # GAME1は初期選択のことがあるので clicked は厳密に使わない

            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(600)  # タブ切替の安定待機

            # --- 可視状態の data-clipboard-text を最優先で読む ---
            payload: Optional[str] = None
            try:
                vis = page.locator("[data-clipboard-text]:visible")
                try:
                    vis.first.wait_for(state="visible", timeout=3000)
                except Exception:
                    pass
                cnt = vis.count()
                for idx in range(cnt):
                    el = vis.nth(idx)
                    txt = el.get_attribute("data-clipboard-text")
                    if txt and txt.strip():
                        payload = txt.strip()
                        break
            except Exception:
                pass

            # 予備：ボタン（「詳細」「試合結果」「コピー」を含むラベル）から辿る
            if not payload:
                btns = page.get_by_role("button", name=re.compile(r"詳細.*試合結果.*コピー"))
                bcnt = btns.count()
                for j in range(bcnt):
                    try:
                        h = btns.nth(j).element_handle()
                        if not h:
                            continue
                        attr = h.get_attribute("data-clipboard-text")
                        if attr and attr.strip():
                            payload = attr.strip()
                            break
                        # 近い親に data-clipboard-text が付くパターン
                        par = page.evaluate_handle("el => el.closest('[data-clipboard-text]')", h)
                        if par:
                            attr = par.get_attribute("data-clipboard-text")
                            if attr and attr.strip():
                                payload = attr.strip()
                                break
                    except Exception:
                        continue

            # 最後の保険：DOM全体から data-clipboard-text を拾う
            if not payload:
                html = page.content()
                soup = BeautifulSoup(html, "html.parser")
                for el in soup.find_all(attrs={"data-clipboard-text": True}):
                    cand = (el.get("data-clipboard-text") or "").strip()
                    if cand:
                        payload = cand
                        break

            if payload:
                results.append((i, payload))

            page.wait_for_timeout(600)  # 次のタブへ

        browser.close()

    return results


def collect_single_game_text(url: str) -> Optional[str]:
    """単一URL（グループURLでも可）から、現在表示中の試合の詳細テキストだけ取得。"""
    pairs = collect_game_texts_from_group(url, max_games=1)
    return pairs[0][1] if pairs else None
