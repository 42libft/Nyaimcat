"""Session management primitives for ESCL scrim collection."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import pandas as pd


@dataclass(frozen=True)
class SessionKey:
    """Unique identifier for a scrim collection session."""

    guild_id: int
    channel_id: int
    user_id: int


@dataclass
class GameRecord:
    """Single game dataframe captured during a session."""

    number: int
    source: str
    frame: pd.DataFrame


@dataclass
class ScrimSession:
    """In-memory container for games collected from a guild/channel/user."""

    scrim_group: str = ""
    scrim_id: Optional[str] = None
    records: List[GameRecord] = field(default_factory=list)

    def add_frame(
        self,
        frame: pd.DataFrame,
        *,
        source: str,
        scrim_id: Optional[str] = None,
        game_number: Optional[int] = None,
    ) -> GameRecord:
        """Store a parsed dataframe and return the associated record."""

        if scrim_id and not self.scrim_id:
            self.scrim_id = scrim_id

        number = game_number if game_number is not None else len(self.records) + 1
        decorated = frame.copy()
        decorated.insert(0, "game_no", number)
        decorated.insert(0, "scrim_id", self.scrim_id or "")
        decorated.insert(0, "scrim_group", self.scrim_group)

        record = GameRecord(number=number, source=source, frame=decorated)
        self.records.append(record)
        return record

    @property
    def total_games(self) -> int:
        """Return the number of collected games."""

        return len(self.records)

    def combined_frame(self) -> pd.DataFrame:
        """Return a dataframe merging all stored games."""

        if not self.records:
            raise ValueError("No games have been collected.")
        merged = pd.concat([record.frame for record in self.records], ignore_index=True)
        return merged.rename(columns={"scrim_group": "group", "game_no": "game"})

    def build_filename(self) -> str:
        """Generate a descriptive CSV filename for the session."""

        group = self.scrim_group or "G?"
        scrim_id = self.scrim_id or "unknown"
        return f"ESCL_{group}_{scrim_id}.csv"


class SessionError(RuntimeError):
    """Base error for session management issues."""


class SessionNotFoundError(SessionError):
    """Raised when attempting to access a missing session."""


class SessionManager:
    """Manage scrim sessions keyed by guild/channel/user."""

    def __init__(self, default_group: str = "") -> None:
        self._sessions: Dict[SessionKey, ScrimSession] = {}
        self._default_group = default_group

    def start_session(
        self,
        key: SessionKey,
        scrim_group: Optional[str] = None,
        scrim_id: Optional[str] = None,
    ) -> ScrimSession:
        """Create or overwrite a session for the supplied key."""

        session = ScrimSession(
            scrim_group=scrim_group or self._default_group,
            scrim_id=scrim_id,
        )
        self._sessions[key] = session
        return session

    def get_session(self, key: SessionKey) -> Optional[ScrimSession]:
        """Return a session if present."""

        return self._sessions.get(key)

    def require_session(self, key: SessionKey) -> ScrimSession:
        """Return a session, raising if none exists."""

        session = self.get_session(key)
        if session is None:
            raise SessionNotFoundError("Session not initialised for this channel/user.")
        return session

    def clear_session(self, key: SessionKey) -> None:
        """Remove a stored session if present."""

        self._sessions.pop(key, None)

    def clear_all(self) -> None:
        """Remove all active sessions (mainly for testing)."""

        self._sessions.clear()

    @property
    def default_group(self) -> str:
        """Expose the configured default scrim group."""

        return self._default_group
