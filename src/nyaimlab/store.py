"""In-memory data store for the Nyaimlab management API."""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel

from .context import RequestContext
from .schemas import (
    AuditExportFormat,
    AuditExportRequest,
    AuditSearchRequest,
    GuidelineTemplate,
    GuidelineTestRequest,
    IntroduceConfig,
    IntroduceSchema,
    RoleEmojiMapRequest,
    RoleRemovalRequest,
    RolesConfig,
    RolesPreviewRequest,
    ScrimConfig,
    ScrimRunRequest,
    SettingsPayload,
    VerifyConfig,
    WelcomeConfig,
)


def _dump_model(model: Optional[BaseModel]) -> Optional[Dict[str, Any]]:
    """Convert a pydantic model into a plain dictionary."""

    if model is None:
        return None
    return model.model_dump(mode="python")


def _clone(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Deep copy a JSON-serialisable dictionary."""

    if data is None:
        return None
    return json.loads(json.dumps(data))


@dataclass
class AuditEntry:
    """Single audit log entry."""

    audit_id: str
    timestamp: datetime
    guild_id: str
    action: str
    ok: bool
    actor_id: str
    client_id: str
    session_id: str
    payload: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self, include_payload: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "audit_id": self.audit_id,
            "timestamp": self.timestamp.isoformat(),
            "guild_id": self.guild_id,
            "action": self.action,
            "ok": self.ok,
            "actor_id": self.actor_id,
            "client_id": self.client_id,
            "session_id": self.session_id,
        }
        if self.error:
            data["error"] = self.error
        if self.metadata:
            data.update(self.metadata)
        if include_payload and self.payload is not None:
            data["payload"] = self.payload
        return data


@dataclass
class GuildState:
    """Stored state for a guild."""

    welcome: Optional[Dict[str, Any]] = None
    guideline: Optional[Dict[str, Any]] = None
    verify: Optional[Dict[str, Any]] = None
    roles: Optional[Dict[str, Any]] = None
    role_emoji_map: Dict[str, str] = field(default_factory=dict)
    introduce: Optional[Dict[str, Any]] = None
    introduce_schema: Dict[str, Any] = field(default_factory=lambda: {"fields": []})
    scrims: Optional[Dict[str, Any]] = None
    settings: Dict[str, Any] = field(default_factory=dict)


class Store:
    """Thread-safe state container with audit logging."""

    def __init__(self) -> None:
        self._guilds: Dict[str, GuildState] = {}
        self._audit: List[AuditEntry] = []
        self._lock = Lock()

    # ------------------------------------------------------------------
    # Helper utilities
    # ------------------------------------------------------------------
    def _ensure_state(self, guild_id: str) -> GuildState:
        state = self._guilds.get(guild_id)
        if state is None:
            state = GuildState()
            self._guilds[guild_id] = state
        return state

    def _record_audit(
        self,
        ctx: RequestContext,
        action: str,
        *,
        ok: bool,
        payload: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditEntry:
        entry = AuditEntry(
            audit_id=str(uuid4()),
            timestamp=datetime.now(timezone.utc),
            guild_id=ctx.guild_id,
            action=action,
            ok=ok,
            actor_id=ctx.actor_id,
            client_id=ctx.client_id,
            session_id=ctx.session_id,
            payload=payload,
            error=error,
            metadata=metadata or {},
        )
        with self._lock:
            self._audit.append(entry)
        return entry

    def snapshot(
        self, ctx: RequestContext, *, audit_limit: int = 50
    ) -> tuple[Dict[str, Any], AuditEntry]:
        """Return the stored configuration for a guild."""

        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            payload: Dict[str, Any] = {
                "welcome": _clone(state.welcome),
                "guideline": _clone(state.guideline),
                "verify": _clone(state.verify),
                "roles": _clone(state.roles),
                "role_emoji_map": dict(state.role_emoji_map),
                "introduce": _clone(state.introduce),
                "introduce_schema": _clone(state.introduce_schema),
                "scrims": _clone(state.scrims),
                "settings": _clone(state.settings),
            }
            recent: List[Dict[str, Any]] = []
            if audit_limit > 0:
                recent = [
                    entry.to_dict(include_payload=True)
                    for entry in self._audit
                    if entry.guild_id == ctx.guild_id
                ][-audit_limit:]
                payload["audit_recent"] = recent

        serialised = json.loads(json.dumps(payload))
        entry = self._record_audit(
            ctx,
            "state.snapshot",
            ok=True,
            metadata={"audit_sample": len(recent)},
        )
        return serialised, entry

    # ------------------------------------------------------------------
    # Welcome
    # ------------------------------------------------------------------
    def save_welcome(
        self, ctx: RequestContext, payload: WelcomeConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.welcome = data
        entry = self._record_audit(
            ctx,
            "welcome.post",
            ok=True,
            payload=data,
            metadata={"channel_id": payload.channel_id},
        )
        return data, entry

    # ------------------------------------------------------------------
    # Guideline
    # ------------------------------------------------------------------
    def save_guideline(
        self, ctx: RequestContext, payload: GuidelineTemplate
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.guideline = data
        entry = self._record_audit(
            ctx,
            "guideline.save",
            ok=True,
            payload=data,
        )
        return data, entry

    def test_guideline(
        self, ctx: RequestContext, request: GuidelineTestRequest
    ) -> tuple[Dict[str, Any], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            preview = state.guideline.copy() if state.guideline else {}
        preview.update({
            "target_user_id": request.target_user_id,
            "dry_run": request.dry_run,
        })
        entry = self._record_audit(
            ctx,
            "guideline.test",
            ok=True,
            payload=preview,
        )
        return preview, entry

    # ------------------------------------------------------------------
    # Verify
    # ------------------------------------------------------------------
    def save_verify(
        self, ctx: RequestContext, payload: VerifyConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.verify = data
        entry = self._record_audit(
            ctx,
            "verify.post",
            ok=True,
            payload=data,
            metadata={"channel_id": payload.channel_id},
        )
        return data, entry

    def remove_verify(self, ctx: RequestContext) -> AuditEntry:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.verify = None
        return self._record_audit(ctx, "verify.remove", ok=True)

    # ------------------------------------------------------------------
    # Roles
    # ------------------------------------------------------------------
    def save_roles(
        self, ctx: RequestContext, payload: RolesConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.roles = data
        entry = self._record_audit(
            ctx,
            "roles.post",
            ok=True,
            payload=data,
            metadata={"channel_id": payload.channel_id},
        )
        return data, entry

    def map_role_emoji(
        self, ctx: RequestContext, payload: RoleEmojiMapRequest
    ) -> tuple[Dict[str, str], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            if payload.emoji:
                state.role_emoji_map[payload.role_id] = payload.emoji
            else:
                state.role_emoji_map.pop(payload.role_id, None)
            mapping = dict(state.role_emoji_map)
        entry = self._record_audit(
            ctx,
            "roles.mapEmoji",
            ok=True,
            payload={"role_id": payload.role_id, "emoji": payload.emoji},
        )
        return mapping, entry

    def remove_role(
        self, ctx: RequestContext, payload: RoleRemovalRequest
    ) -> tuple[Optional[Dict[str, Any]], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            if payload.role_id is None:
                state.roles = None
                state.role_emoji_map.clear()
            elif state.roles:
                roles = [r for r in state.roles.get("roles", []) if r["role_id"] != payload.role_id]
                state.roles["roles"] = roles
            current = state.roles.copy() if state.roles else None
        entry = self._record_audit(
            ctx,
            "roles.remove",
            ok=True,
            payload={"role_id": payload.role_id},
        )
        return current, entry

    def preview_roles(
        self, ctx: RequestContext, payload: RolesPreviewRequest
    ) -> tuple[Dict[str, Any], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            preview = {
                "style": state.roles.get("style") if state.roles else None,
                "roles": state.roles.get("roles", []) if state.roles else [],
                "emoji_map": dict(state.role_emoji_map),
                "locale": payload.locale.value,
            }
        entry = self._record_audit(
            ctx,
            "roles.preview",
            ok=True,
            payload={"locale": payload.locale.value},
        )
        return preview, entry

    # ------------------------------------------------------------------
    # Introduce
    # ------------------------------------------------------------------
    def save_introduce(
        self, ctx: RequestContext, payload: IntroduceConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.introduce = data
        entry = self._record_audit(
            ctx,
            "introduce.post",
            ok=True,
            payload=data,
            metadata={"channel_id": payload.channel_id},
        )
        return data, entry

    def save_introduce_schema(
        self, ctx: RequestContext, payload: IntroduceSchema
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        ids = [field["field_id"] for field in data.get("fields", [])]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate field_id detected in introduce schema")
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.introduce_schema = data
        entry = self._record_audit(
            ctx,
            "introduce.schema.save",
            ok=True,
            payload=data,
        )
        return data, entry

    # ------------------------------------------------------------------
    # Scrims
    # ------------------------------------------------------------------
    def save_scrim_config(
        self, ctx: RequestContext, payload: ScrimConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.scrims = data
        entry = self._record_audit(
            ctx,
            "scrims.config.save",
            ok=True,
            payload=data,
        )
        return data, entry

    def run_scrim(
        self, ctx: RequestContext, payload: ScrimRunRequest
    ) -> tuple[Dict[str, Any], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            if not state.scrims:
                raise ValueError("Scrim configuration is not set")
            actions = []
            for rule in state.scrims.get("rules", []):
                actions.append(
                    {
                        "day": rule.get("day"),
                        "notify_channel_id": rule.get("notify_channel_id"),
                        "min_team_members": rule.get("min_team_members"),
                        "status": "dry_run" if payload.dry_run else "scheduled",
                    }
                )
        result = {"actions": actions, "dry_run": payload.dry_run}
        entry = self._record_audit(
            ctx,
            "scrims.run",
            ok=True,
            payload=result,
        )
        return result, entry

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------
    def save_settings(
        self, ctx: RequestContext, payload: SettingsPayload
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = _dump_model(payload) or {}
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.settings.update(data)
        entry = self._record_audit(
            ctx,
            "settings.save",
            ok=True,
            payload=data,
        )
        return data, entry

    # ------------------------------------------------------------------
    # Audit search/export
    # ------------------------------------------------------------------
    def search_audit(
        self, ctx: RequestContext, payload: AuditSearchRequest
    ) -> tuple[List[Dict[str, Any]], AuditEntry]:
        results: List[AuditEntry]
        with self._lock:
            results = [entry for entry in self._audit if entry.guild_id == ctx.guild_id]
        filtered: List[AuditEntry] = []
        for entry in results:
            if payload.action and entry.action != payload.action:
                continue
            if payload.user_id and entry.actor_id != payload.user_id:
                continue
            if payload.channel_id and entry.metadata.get("channel_id") != payload.channel_id:
                continue
            if payload.since and entry.timestamp < payload.since:
                continue
            if payload.until and entry.timestamp > payload.until:
                continue
            filtered.append(entry)
        # Latest entries first for the dashboard
        filtered.sort(key=lambda e: e.timestamp, reverse=True)
        limited = filtered[: payload.limit]
        data = [entry.to_dict(include_payload=True) for entry in limited]
        audit_entry = self._record_audit(
            ctx,
            "audit.search",
            ok=True,
            payload={"results": len(data)},
        )
        return data, audit_entry

    def export_audit(
        self, ctx: RequestContext, payload: AuditExportRequest
    ) -> tuple[str, AuditEntry]:
        results, _ = self.search_audit(ctx, payload)
        text: str
        if payload.format == AuditExportFormat.NDJSON:
            lines = [json.dumps(row, ensure_ascii=False) for row in results]
            text = "\n".join(lines)
        else:
            buffer = io.StringIO()
            rows = []
            fieldnames = set()
            for row in results:
                row_copy = dict(row)
                payload_data = row_copy.pop("payload", None)
                if payload_data is not None:
                    row_copy["payload"] = json.dumps(payload_data, ensure_ascii=False)
                rows.append(row_copy)
                fieldnames.update(row_copy.keys())
            writer = csv.DictWriter(buffer, fieldnames=sorted(fieldnames))
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
            text = buffer.getvalue()
        audit_entry = self._record_audit(
            ctx,
            "audit.export",
            ok=True,
            payload={"format": payload.format.value, "bytes": len(text.encode("utf-8"))},
        )
        return text, audit_entry

    def log_failure(
        self,
        ctx: RequestContext,
        action: str,
        message: str,
        *,
        payload: Optional[Dict[str, Any]] = None,
    ) -> AuditEntry:
        """Utility for endpoints to record failed operations."""

        return self._record_audit(
            ctx,
            action,
            ok=False,
            error=message,
            payload=payload,
        )


# Shared singleton store used by the API
STORE = Store()
