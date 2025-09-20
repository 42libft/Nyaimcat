"""High-level orchestration for ESCL scrim collection commands."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import pandas as pd

from .parser import parse_pasted_text
from .scraper import (
    collect_game_texts_from_group,
    extract_text_from_url,
    guess_scrim_id,
)
from .session import (
    GameRecord,
    ScrimSession,
    SessionKey,
    SessionManager,
    SessionNotFoundError,
)


class CollectorError(RuntimeError):
    """Raised when an operator-facing validation error occurs."""


@dataclass
class CollectorResult:
    """Result of a bulk export operation."""

    filename: str
    dataframe: pd.DataFrame


class ScrimCollector:
    """Coordinate scrim sessions and export helpers for the Discord bot."""

    def __init__(self, default_scrim_group: str = "") -> None:
        self._sessions = SessionManager(default_scrim_group)

    def start_session(
        self,
        key: SessionKey,
        *,
        scrim_group: Optional[str] = None,
        scrim_url: Optional[str] = None,
    ) -> ScrimSession:
        """Initialise a session for the supplied guild/channel/user key."""

        scrim_id = guess_scrim_id(scrim_url)
        return self._sessions.start_session(key, scrim_group, scrim_id)

    async def add_game(
        self,
        key: SessionKey,
        *,
        url: Optional[str] = None,
        text: Optional[str] = None,
        attachment_bytes: Optional[bytes] = None,
    ) -> GameRecord:
        """Parse incoming data and add a game to the active session."""

        try:
            session = self._sessions.require_session(key)
        except SessionNotFoundError as exc:  # pragma: no cover - defensive
            raise CollectorError("まず /escl_new でセッションを開始してください。") from exc

        payload: Optional[str] = None
        source = "text"
        if url:
            payload = await extract_text_from_url(url)
            source = "url"
        elif text:
            payload = text
        elif attachment_bytes is not None:
            payload = attachment_bytes.decode("utf-8", errors="ignore")
            source = "file"

        if not payload:
            raise CollectorError("入力が見つかりませんでした。`url` / `text` / `file` のいずれかを指定してください。")

        frame = parse_pasted_text(payload)
        scrim_id_hint = guess_scrim_id(url) if url else None
        return session.add_frame(frame, source=source, scrim_id=scrim_id_hint)

    def summarise(self, key: SessionKey) -> ScrimSession:
        """Return session state for progress reporting."""

        try:
            return self._sessions.require_session(key)
        except SessionNotFoundError as exc:  # pragma: no cover - defensive
            raise CollectorError("アクティブなセッションはありません。/escl_new から開始してください。") from exc

    def clear_session(self, key: SessionKey) -> None:
        """Remove the session for the supplied key."""

        self._sessions.clear_session(key)

    def finish_session(self, key: SessionKey) -> CollectorResult:
        """Export the collected games and clear the active session."""

        session = self._sessions.get_session(key)
        if session is None or session.total_games == 0:
            raise CollectorError("取り込み済みデータがありません。/escl_add でデータを追加してください。")

        dataframe = session.combined_frame()
        filename = session.build_filename()
        self._sessions.clear_session(key)
        return CollectorResult(filename=filename, dataframe=dataframe)

    async def collect_from_urls(
        self, urls: Sequence[str], *, scrim_group: Optional[str] = None
    ) -> CollectorResult:
        """Fetch multiple game URLs and generate a combined dataframe."""

        cleaned = [u.strip() for u in urls if u and u.strip()]
        if not cleaned:
            raise CollectorError("URLが見つかりませんでした。")

        session = ScrimSession(
            scrim_group=scrim_group or self._sessions.default_group,
            scrim_id=guess_scrim_id(cleaned[0]),
        )

        for idx, url in enumerate(cleaned, start=1):
            if not url.startswith("http"):
                raise CollectorError(f"URL形式エラー: {url}")
            payload = await extract_text_from_url(url)
            if not payload:
                raise CollectorError(
                    f"ゲーム{idx}の抽出に失敗：{url}\n（ページの『詳細な試合結果をコピー』テキストでの貼付なら確実です）"
                )
            frame = parse_pasted_text(payload)
            session.add_frame(frame, source="url", scrim_id=guess_scrim_id(url), game_number=idx)

        dataframe = session.combined_frame()
        filename = session.build_filename()
        return CollectorResult(filename=filename, dataframe=dataframe)

    async def collect_from_parent(
        self, parent_url: str, *, scrim_group: Optional[str] = None, max_games: int = 6
    ) -> CollectorResult:
        """Collect GAME1〜6 texts from a parent scrim URL."""

        pairs = await collect_game_texts_from_group(parent_url, max_games=max_games)
        if not pairs:
            raise CollectorError("親ページから GAME 1〜6 の詳細テキストを取得できませんでした。URLをご確認ください。")

        session = ScrimSession(
            scrim_group=scrim_group or self._sessions.default_group,
            scrim_id=guess_scrim_id(parent_url),
        )
        for number, payload in pairs:
            frame = parse_pasted_text(payload)
            session.add_frame(frame, source="url", scrim_id=session.scrim_id, game_number=number)

        dataframe = session.combined_frame()
        filename = session.build_filename()
        return CollectorResult(filename=filename, dataframe=dataframe)


__all__ = [
    "CollectorError",
    "CollectorResult",
    "ScrimCollector",
]
