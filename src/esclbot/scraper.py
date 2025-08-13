# src/esclbot/scraper.py
from __future__ import annotations
import asyncio
import re
from typing import List, Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

# ========== 既存の静的フェッチ（フォールバック用） ==========
def fetch_html(url: str, timeout_sec: int = 15) -> Optional[str]:
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout_sec, headers={
            "User-Agent": "Mozilla/5.0 (ESCL Collector Bot)"
        }) as client:
            r = client.get(url)
            r.raise_for_status()
            return r.text
    except Exception:
        return None

# 「詳細」テキストの必須ヘッダ（判定用）
REQUIRED_HEADERS = {
    "team_name","team_num","player_name","character","placement",
    "kills","assists","damage","shots","hits","accuracy",
    "headshots","headshots_accuracy","survival_time"
}

def _looks_like_detailed_payload(text: str) -> bool:
    if not text:
        return False
    head = text.splitlines()[0].strip().lower()
    cols = re.split(r"\t|\s{2,}", head)
    cols = {c.strip() for c in cols if c.strip()}
    return REQUIRED_HEADERS.issubset(cols)

# ===========================================================
# Playwright (Chromium) でレンダリングして抽出
# ===========================================================
async def _extract_with_playwright(url: str) -> Optional[str]:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent="Mozilla/5.0 (ESCL Collector Bot)")
        page = await ctx.new_page()

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        # ボタンテキストに「詳細な試合結果をコピー」を含む要素を待つ（最大30秒）
        btn = await page.locator("text=詳細な試合結果をコピー").first
        try:
            await btn.wait_for(state="visible", timeout=30000)
        except Exception:
            # ボタンが無い場合はページ全体から候補を探索
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            for el in soup.find_all(attrs={"data-clipboard-text": True}):
                txt = el.get("data-clipboard-text", "").strip()
                if _looks_like_detailed_payload(txt):
                    await browser.close()
                    return txt
            await browser.close()
            return None

        # data-clipboard-text を持つ自身 or 親を探す
        handle = await btn.element_handle()
        txt = None
        if handle:
            # 自身
            attr = await handle.get_attribute("data-clipboard-text")
            if attr and _looks_like_detailed_payload(attr.strip()):
                txt = attr.strip()
            # 親
            if not txt:
                parent = await handle.evaluate_handle("el => el.closest('[data-clipboard-text]')")
                if parent:
                    attr = await parent.get_attribute("data-clipboard-text")
                    if attr and _looks_like_detailed_payload(attr.strip()):
                        txt = attr.strip()

        # 最後の手段：ページ内容から復元
        if not txt:
            html = await page.content()
            soup = BeautifulSoup(html, "html.parser")
            # pre/code/textarea
            for tag in soup.find_all(["pre","code","textarea"]):
                payload = tag.get_text("\n").strip()
                if _looks_like_detailed_payload(payload):
                    txt = payload
                    break
            # script内
            if not txt:
                for sc in soup.find_all("script"):
                    raw = sc.get_text(" ").strip()
                    if "team_name" in raw:
                        payload = raw.replace("\\n", "\n").replace("\\t", "\t")
                        m = re.search(r"(team_name[^\r\n]+(?:[\r\n].+)*)", payload)
                        if m and _looks_like_detailed_payload(m.group(1).strip()):
                            txt = m.group(1).strip()
                            break

        await browser.close()
        return txt

def extract_text_from_url(url: str, timeout_sec: int = 15) -> Optional[str]:
    """
    ゲームページURLから『詳細な試合結果』のテキストを取得。
    1) Playwright でレンダリングして data-clipboard-text を読む
    2) 失敗したら静的HTMLからフォールバック抽出
    """
    try:
        return asyncio.run(_extract_with_playwright(url))
    except Exception:
        pass  # フォールバックへ

    # フォールバック（静的HTML）
    html = fetch_html(url, timeout_sec=timeout_sec)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    # data-clipboard-text 総当り
    for el in soup.find_all(attrs={"data-clipboard-text": True}):
        txt = el.get("data-clipboard-text", "").strip()
        if _looks_like_detailed_payload(txt):
            return txt
    return None

# ===========================================================
# 親URL → GAME1〜6のURLを抽出（レンダリング後のDOMから拾う）
# ===========================================================
async def _find_urls_with_playwright(parent_url: str, limit: int = 6) -> List[str]:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent="Mozilla/5.0 (ESCL Collector Bot)")
        page = await ctx.new_page()
        await page.goto(parent_url, wait_until="domcontentloaded", timeout=30000)

        # DOM全体の content を取り、正規表現で /scrims/<sid>/<gid> を抽出
        html = await page.content()
        await browser.close()

    return _extract_game_urls_from_html(html, parent_url, limit)

SCRIM_PATH_RE = re.compile(r"(/scrims/[0-9a-f\-]{8,}/[0-9a-f\-]{8,})")

def _extract_game_urls_from_html(html: str, base_url: str, limit: int) -> List[str]:
    from urllib.parse import urljoin
    # 親URLの scrimId を優先
    sid_hint = guess_scrim_id(base_url)
    urls: List[str] = []
    seen = set()

    for m in SCRIM_PATH_RE.finditer(html):
        path = m.group(1)
        full = urljoin(base_url, path)
        # sid一致のものだけ
        sid = guess_scrim_id(full)
        if sid_hint and sid != sid_hint:
            continue
        if full not in seen:
            seen.add(full)
            urls.append(full)
        if len(urls) >= limit:
            break
    return urls

def guess_scrim_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/scrims/([0-9a-f\-]{8,})", url)
    return m.group(1) if m else None

def find_game_urls_from_parent(parent_url: str, limit: int = 6) -> List[str]:
    try:
        return asyncio.run(_find_urls_with_playwright(parent_url, limit))
    except Exception:
        # フォールバック（静的HTML）
        html = fetch_html(parent_url)
        if not html:
            return []
        return _extract_game_urls_from_html(html, parent_url, limit)
