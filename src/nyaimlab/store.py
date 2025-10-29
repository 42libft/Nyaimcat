"""In-memory data store for the Nyaimlab management API."""
from __future__ import annotations

import csv
import io
import json
from copy import deepcopy
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
    RagConfig,
    RagKnowledgeEntry,
    RagPromptsConfig,
    RagFeelingsConfig,
    RagShortTermConfig,
    RoleEmojiMapRequest,
    RoleRemovalRequest,
    RolesConfig,
    RolesPreviewRequest,
    ScrimConfig,
    ScrimRunRequest,
    SettingsPayload,
    VerifyConfig,
    WelcomeConfig,
    WelcomeMode,
)


def _dump_model(model: Optional[BaseModel]) -> Optional[Dict[str, Any]]:
    """Convert a pydantic model into a plain dictionary."""

    if model is None:
        return None
    return model.model_dump(mode="json", exclude_none=True)


DEFAULT_RAG_PROMPT_BASE = (
    "あなたは Nyaimlab Discord サーバーで暮らす中性的な猫のキャラクターボットとして振る舞ってください。"
    "相手に寄り添い、尊重しながら返答してください。"
    "ヘルプやアドバイス以外の雑談では、短く自然なチャット文を意識してください。"
    "絵文字や顔文字は使わないでください。"
    "自分が AI や ChatGPT であると説明したり、注意書きや免責事項を付けたりしないでください。"
    "求められない限り長文にならないようにし、1〜2文程度で要点だけを返してください。"
)

DEFAULT_RAG_PROMPT_HELP = (
    "あなたは Nyaimlab サーバーの丁寧なヘルプ担当です。"
    "わかりやすく落ち着いたトーンで、手順や理由を整理して伝えてください。"
    "語尾は基本的に敬語ですが、たまに柔らかく「〜にゃ」と添えても構いません。"
    "絵文字や顔文字は使わず、文末は句読点またはにゃ語尾にしてください。"
)

DEFAULT_RAG_PROMPT_COACH = (
    "あなたは Aim やゲーム戦略のコーチ役です。"
    "中性的な猫のキャラクターとして、ポジティブに励ましつつ提案をしてください。"
    "アドバイスは実践的かつ簡潔にまとめ、語尾は「〜にゃ」「〜にゃー」などを使いつつも行数は短めに保ってください。"
    "絵文字は使用せず、親しい友達に話す感覚で表現してください。"
)

DEFAULT_RAG_PROMPT_CHAT = (
    "一人称は「ボク」、語尾には必ず「〜にゃ」「〜にゃー」「〜にゃ〜」「〜にゃ！」「〜にゃ…」のいずれかを付けてください。"
    "絵文字は使わず、雑談は1〜2行程度で短く、友達感覚で自然に返答してください。"
)


def default_rag_config() -> RagConfig:
    """Return the default RAG configuration."""

    return RagConfig(
        prompts=RagPromptsConfig(
            base=DEFAULT_RAG_PROMPT_BASE,
            help=DEFAULT_RAG_PROMPT_HELP,
            coach=DEFAULT_RAG_PROMPT_COACH,
            chat=DEFAULT_RAG_PROMPT_CHAT,
        ),
        feelings=RagFeelingsConfig(),
        short_term=RagShortTermConfig(),
    )


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
    rag: Optional[Dict[str, Any]] = None


class Store:
    """Thread-safe state container with audit logging."""

    def __init__(self) -> None:
        self._guilds: Dict[str, GuildState] = {}
        self._audit: List[AuditEntry] = []
        self._lock = Lock()

    # ------------------------------------------------------------------
    # Snapshot helpers
    # ------------------------------------------------------------------
    def get_state(self, ctx: RequestContext) -> tuple[Dict[str, Any], AuditEntry]:
        """Return a serialisable snapshot of the guild state."""

        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            snapshot: Dict[str, Any] = {
                "welcome": dict(state.welcome) if state.welcome else None,
                "guideline": dict(state.guideline) if state.guideline else None,
                "verify": dict(state.verify) if state.verify else None,
                "roles": dict(state.roles) if state.roles else None,
                "role_emoji_map": dict(state.role_emoji_map),
                "introduce": dict(state.introduce) if state.introduce else None,
                "introduce_schema": dict(state.introduce_schema),
                "scrims": dict(state.scrims) if state.scrims else None,
                "settings": dict(state.settings),
                "rag": dict(state.rag) if state.rag else None,
            }
        configured_sections = sum(
            1
            for key in ("welcome", "guideline", "verify", "roles", "introduce", "scrims", "rag")
            if snapshot.get(key)
        )
        entry = self._record_audit(
            ctx,
            "state.get",
            ok=True,
            payload={"sections": configured_sections},
        )
        return snapshot, entry

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

    # ------------------------------------------------------------------
    # Import / export helpers (no audit)
    # ------------------------------------------------------------------
    def import_state(self, guild_id: str, snapshot: Dict[str, Any]) -> None:
        """Bootstrap the in-memory state from an external snapshot without auditing."""

        with self._lock:
            state = self._ensure_state(guild_id)
            state.welcome = deepcopy(snapshot.get("welcome"))
            state.guideline = deepcopy(snapshot.get("guideline"))
            state.verify = deepcopy(snapshot.get("verify"))
            state.roles = deepcopy(snapshot.get("roles"))
            state.role_emoji_map = dict(snapshot.get("role_emoji_map") or {})
            state.introduce = deepcopy(snapshot.get("introduce"))
            schema = snapshot.get("introduce_schema") or {"fields": []}
            state.introduce_schema = deepcopy(schema)
            state.scrims = deepcopy(snapshot.get("scrims"))
            state.settings = deepcopy(snapshot.get("settings") or {})
            state.rag = deepcopy(snapshot.get("rag"))

    def export_state(self, guild_id: str) -> Dict[str, Any]:
        """Return a deep-copied snapshot of the stored state without recording audit logs."""

        with self._lock:
            state = self._ensure_state(guild_id)
            snapshot: Dict[str, Any] = {
                "welcome": deepcopy(state.welcome),
                "guideline": deepcopy(state.guideline),
                "verify": deepcopy(state.verify),
                "roles": deepcopy(state.roles),
                "role_emoji_map": dict(state.role_emoji_map),
                "introduce": deepcopy(state.introduce),
                "introduce_schema": deepcopy(state.introduce_schema),
                "scrims": deepcopy(state.scrims),
                "settings": deepcopy(state.settings),
            }
        return snapshot

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

    def log_welcome_preview(
        self, ctx: RequestContext, mode: WelcomeMode
    ) -> AuditEntry:
        """Record a preview action for audit history."""

        return self._record_audit(
            ctx,
            "welcome.preview",
            ok=True,
            payload={"mode": mode.value},
        )

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

    # ------------------------------------------------------------------
    # RAG configuration
    # ------------------------------------------------------------------
    def get_rag_config(self, ctx: RequestContext) -> tuple[Dict[str, Any], AuditEntry]:
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            raw_config = state.rag or default_rag_config().model_dump(mode="json")

        config = RagConfig.model_validate(raw_config)
        entry = self._record_audit(
            ctx,
            "rag.config.get",
            ok=True,
            payload={"excluded_channels": len(config.short_term.excluded_channels)},
        )
        return config.model_dump(mode="json"), entry

    def save_rag_config(
        self, ctx: RequestContext, payload: RagConfig
    ) -> tuple[Dict[str, Any], AuditEntry]:
        data = payload.model_dump(mode="json", exclude_none=True)
        with self._lock:
            state = self._ensure_state(ctx.guild_id)
            state.rag = data
        entry = self._record_audit(
            ctx,
            "rag.config.save",
            ok=True,
            payload={"excluded_channels": len(payload.short_term.excluded_channels)},
        )
        return data, entry

    def log_rag_knowledge_add(
        self,
        ctx: RequestContext,
        entry: RagKnowledgeEntry,
        *,
        path: str,
    ) -> AuditEntry:
        return self._record_audit(
            ctx,
            "rag.knowledge.add",
            ok=True,
            payload={
                "title": entry.title,
                "tags": entry.tags,
                "path": path,
            },
        )

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
