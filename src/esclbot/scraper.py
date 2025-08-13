# 置き換え用
from __future__ import annotations
import re
from typing import Optional, List
import httpx
from bs4 import BeautifulSoup

# 「詳細」テキストに必須の列（順不同でOK）
REQUIRED_HEADERS = {
    "team_name","team_num","player_name","character","placement",
    "kills","assists","damage","shots","hits","accuracy",
    "headshots","headshots_accuracy","survival_time"
}

def _looks_like_detailed_payload(text: str) -> bool:
    """詳細テキストの見分け：ヘッダが十分そろっているか"""
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
            # 同じ階層/親に data-clipboard-text が付いているケースも拾う
            target = el if el.has_attr("data-clipboard-text") else el.find_parent(attrs={"data-clipboard-text": True})
            if target and target.has_attr("data-clipboard-text"):
                txt = target["data-clipboard-text"].strip()
                if _looks_like_detailed_payload(txt):
                    return txt

    # 2) data-clipboard-text を総当りし、詳細ヘッダのものだけ返す
    candidates = []
    for el in soup.find_all(attrs={"data-clipboard-text": True}):
        txt = el.get("data-clipboard-text", "").strip()
        if _looks_like_detailed_payload(txt):
            candidates.append(txt)
    if candidates:
        # 一番長い＝詳細になりやすい
        return max(candidates, key=len)

    # 3) pre/code/textarea のテキストにも詳細ヘッダがあれば採用
    for tag in soup.find_all(["pre", "code", "textarea"]):
        txt = tag.get_text("\n").strip()
        if _looks_like_detailed_payload(txt):
            return txt

    # 4) script 埋め込みからの回収（エスケープ解除して判定）
    for sc in soup.find_all("script"):
        raw = sc.get_text(" ").strip()
        if "team_name" in raw:
            # JS内の文字列をざっくり復元
            txt = raw.replace("\\n", "\n").replace("\\t", "\t")
            # 不要な末尾を切るヒューリスティック
            txt = txt.split("];", 1)[0]
            # team_name 行から最後までを拾う
            m = re.search(r"(team_name[^\r\n]+(?:[\r\n].+)*)", txt)
            if m:
                payload = m.group(1).strip()
                if _looks_like_detailed_payload(payload):
                    return payload
    return None

