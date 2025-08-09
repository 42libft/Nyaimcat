from __future__ import annotations
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

TARGET_HEADER_FRAGMENT = "team_name"

def extract_text_from_url(url: str, timeout_sec: int = 15) -> Optional[str]:
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout_sec, headers={
            "User-Agent": "Mozilla/5.0 (ESCL Collector Bot)"
        }) as client:
            r = client.get(url)
            r.raise_for_status()
            html = r.text
    except Exception:
        return None

    soup = BeautifulSoup(html, "html.parser")

    for el in soup.find_all(attrs={"data-clipboard-text": True}):
        txt = el.get("data-clipboard-text", "").strip()
        if TARGET_HEADER_FRAGMENT in txt:
            return txt

    for tag in soup.find_all(["pre", "code", "textarea"]):
        txt = tag.get_text("\n").strip()
        if TARGET_HEADER_FRAGMENT in txt:
            return txt

    for sc in soup.find_all("script"):
        txt = sc.get_text(" ").strip()
        if TARGET_HEADER_FRAGMENT in txt:
            m = re.search(r"(team_name[\s\S]+?)$", txt)
            if m:
                out = m.group(1).replace("\\n", "\n").replace("\\t", "\t")
                cut = out.split("];", 1)[0]
                return cut
    return None

def guess_scrim_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    m = re.search(r"/scrims/([0-9a-f\-]+)/?", url)
    return m.group(1) if m else None
