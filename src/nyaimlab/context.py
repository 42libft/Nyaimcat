"""Request context utilities for the admin API."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class RequestContext:
    """Metadata extracted from authenticated requests."""

    guild_id: str
    client_id: str
    session_id: str
    actor_id: str
    scopes: Tuple[str, ...] = ()

    def to_metadata(self) -> dict[str, str]:
        """Return a serialisable metadata representation for audit logging."""

        return {
            "guild_id": self.guild_id,
            "client_id": self.client_id,
            "session_id": self.session_id,
            "actor_id": self.actor_id,
        }
