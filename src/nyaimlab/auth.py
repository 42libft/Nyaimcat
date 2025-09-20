"""Authentication helpers for the management API."""
from __future__ import annotations

import os
from typing import Tuple

from fastapi import Header, HTTPException, status

from .context import RequestContext


def _extract_bearer_token(authorization: str) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization scheme")
    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty bearer token")
    return token


def _normalize_scopes(raw_scopes: str | None) -> Tuple[str, ...]:
    if not raw_scopes:
        return ()
    items = []
    for piece in raw_scopes.split(","):
        item = piece.strip()
        if item:
            items.append(item)
    return tuple(items)


def require_context(
    authorization: str = Header(..., alias="Authorization"),
    x_client: str = Header(..., alias="x-client"),
    x_guild_id: str = Header(..., alias="x-guild-id"),
    x_user_id: str | None = Header(None, alias="x-user-id"),
    x_scopes: str | None = Header(None, alias="x-scopes"),
) -> RequestContext:
    """Validate headers and produce a :class:`RequestContext`."""

    token = _extract_bearer_token(authorization)
    expected = os.getenv("API_AUTH_TOKEN")
    if expected and token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")

    actor = x_user_id or "unknown"
    if not x_guild_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing x-guild-id header")

    return RequestContext(
        guild_id=x_guild_id,
        client_id=x_client,
        session_id=token,
        actor_id=actor,
        scopes=_normalize_scopes(x_scopes),
    )
