# src/esclbot/scraper.py
from __future__ import annotations
import re
from typing import Optional, List

import httpx
from bs4 import BeautifulSoup

# 「詳細な試合結果」だけを受理するための必須ヘッダ
REQUIRED_HEADERS = {
    "team_name","team_num","player_name","character","placement",
    "kills","assists","damage","shots","hits","accuracy",
    "headshots","headshots_accuracy","survival_time"
}

def _looks_like_detailed_payload(text: str) -> bool:
    """詳細テキストかどうかをヘッダで判定"""
    if not text or "team_name" not in text:
        return False
    head = text.splitlines()[0].strip().lower()
    cols = re.split(r"\t|\s{2,}", head)
    cols = set(c.strip().lower() for c in cols if c.strip())
    return REQUIRED_HEADERS.issubset(cols)

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

def extract_text_from_url(url: str, timeout_sec: int = 15) -> Optional[str]:
    """ページから『詳細な試合結果をコピー』のペイロードだけを抽出する。"""
    html = fetch_html(url, timeout_sec=timeout_sec)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")

    # 1) ボタン本文が「詳細な試合結果をコピー」の要素を最優先
    for el in soup.find_all(["button", "a", "div", "span"], string=True):
        label = el.get_text(strip=True)
        if "詳細な試合結果をコピー" in label:
            target = el if el.has_attr("data-clipboard-text") else el.find_parent(attrs={"data-clipboard-text": True})
            if target and target.has_attr("data-clipboard-text"):
                txt = target["data-clipboard-text"].strip()
                if _looks_like_detailed_payload(txt):
                    return txt

    # 2) data-clipboard-text 総当り（詳細ヘッダだけ受理）
    candidates = []
    for el in soup.find_all(attrs={"data-clipboard-text": True}):
        txt = el.get("data-clipboard-text", "").strip()
        if _looks_like_detailed_payload(txt):
            candidates.append(txt)
    if candidates:
        return max(candidates, key=len)

    # 3) pre/code/textarea
    for tag in soup.find_all(["pre", "code", "textarea"]):
        txt = tag.get_text("\n").strip()
        if _looks_like_detailed_payload(txt):
            return txt

    # 4) script 埋め込みから回収
    for sc in soup.find_all("script"):
        raw = sc.get_text(" ").strip()
        if "team_name" in raw:
            txt = raw.replace("\\n", "\n").replace("\\t", "\t")
            txt = txt.split("];", 1)[0]
            m = re.search(r"(team_name[^\r\n]+(?:[\r\n].+)*)", txt)
            if m:
                payload = m.group(1).strip()
                if _looks_like_detailed_payload(payload):
                    return payload
    return None

def guess_scrim_id(url: Optional[str]) -> Optional[str]:
    """URLから scrim_id を推定（/scrims/<scrim_id>/...）"""
    if not url:
        return None
    m = re.search(r"/scrims/([0-9a-f\-]+)/?", url)
    return m.group(1) if m else None

def find_game_urls_from_parent(parent_url: str, limit: int = 6) -> List[str]:
    """親ページから /scrims/<scrimId>/<gameId> のリンクを最大6件拾う"""
    html = fetch_html(parent_url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    found: List[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if re.search(r"/scrims/[0-9a-f\-]+/[0-9a-f\-]+", href):
            if href.startswith("http"):
                url = href
            else:
                base = re.match(r"^(https?://[^/]+)", parent_url)
                if base:
                    url = base.group(1) + href
                else:
                    continue
            if url not in found:
                found.append(url)
        if len(found) >= limit:
            break
    return found

