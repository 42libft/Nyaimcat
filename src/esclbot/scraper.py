"""Helpers for retrieving ESCL scrim payloads from the web."""
from __future__ import annotations

import re
from typing import List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup

USER_AGENT = "Mozilla/5.0 (Nyaimcat Scrim Collector)"
REQUIRED_HEADERS = {
    "team_name",
    "team_num",
    "player_name",
    "character",
    "placement",
    "kills",
    "assists",
    "damage",
    "shots",
    "hits",
    "accuracy",
    "headshots",
    "headshots_accuracy",
    "survival_time",
}
SCRIM_PATH_RE = re.compile(r"(/scrims/[0-9a-f\-]{8,}/[0-9a-f\-]{8,})", re.IGNORECASE)


def _looks_like_detailed_payload(text: str) -> bool:
    if not text:
        return False
    head = text.splitlines()[0].strip().lower()
    columns = re.split(r"\t|\s{2,}", head)
    columns = {c.strip() for c in columns if c.strip()}
    return REQUIRED_HEADERS.issubset(columns)


async def _fetch_html(url: str, *, timeout: int = 15) -> Optional[str]:
    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout, headers=headers) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text
    except httpx.HTTPError:
        return None


def _extract_clipboard_payload(soup: BeautifulSoup) -> Optional[str]:
    for element in soup.find_all(attrs={"data-clipboard-text": True}):
        payload = (element.get("data-clipboard-text") or "").strip()
        if payload and _looks_like_detailed_payload(payload):
            return payload
    return None


def _extract_payload_from_html(html: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    payload = _extract_clipboard_payload(soup)
    if payload:
        return payload

    # Fallback: search for pre/code/textarea blocks that resemble the dataset.
    for tag in soup.find_all(["pre", "code", "textarea"]):
        candidate = tag.get_text("\n").strip()
        if candidate and _looks_like_detailed_payload(candidate):
            return candidate

    for script in soup.find_all("script"):
        raw = (script.get_text(" ") or "").strip()
        if "team_name" not in raw:
            continue
        decoded = raw.replace("\\n", "\n").replace("\\t", "\t")
        match = re.search(r"(team_name[^\r\n]+(?:[\r\n].+)*)", decoded)
        if match:
            candidate = match.group(1).strip()
            if candidate and _looks_like_detailed_payload(candidate):
                return candidate
    return None


async def extract_text_from_url(url: str, timeout: int = 15) -> Optional[str]:
    """Retrieve the detailed match result text from a game page."""

    html = await _fetch_html(url, timeout=timeout)
    if not html:
        return None
    return _extract_payload_from_html(html)


def guess_scrim_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    match = re.search(r"/scrims/([0-9a-f\-]{8,})", url)
    return match.group(1) if match else None


def _extract_game_urls_from_html(html: str, base_url: str, limit: int) -> List[str]:
    from urllib.parse import urljoin

    sid_hint = guess_scrim_id(base_url)
    urls: List[str] = []
    seen = set()

    for match in SCRIM_PATH_RE.finditer(html or ""):
        path = match.group(1)
        absolute = urljoin(base_url, path)
        sid = guess_scrim_id(absolute)
        if sid_hint and sid != sid_hint:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        urls.append(absolute)
        if len(urls) >= limit:
            break
    return urls


async def find_game_urls_from_parent(parent_url: str, limit: int = 6) -> List[str]:
    html = await _fetch_html(parent_url)
    if not html:
        return []
    return _extract_game_urls_from_html(html, parent_url, limit)


async def collect_game_texts_from_group(
    parent_url: str, *, max_games: int = 6
) -> List[Tuple[int, str]]:
    """Return ``(game_no, payload)`` pairs collected from the parent page."""

    urls = await find_game_urls_from_parent(parent_url, limit=max_games)
    results: List[Tuple[int, str]] = []
    for index, url in enumerate(urls, start=1):
        payload = await extract_text_from_url(url)
        if payload:
            results.append((index, payload))
    return results


__all__ = [
    "collect_game_texts_from_group",
    "extract_text_from_url",
    "find_game_urls_from_parent",
    "guess_scrim_id",
]
