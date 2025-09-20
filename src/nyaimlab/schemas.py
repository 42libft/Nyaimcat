"""Pydantic models for the Nyaimlab admin API."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    FieldValidationInfo,
    PositiveInt,
    field_validator,
)


class MemberIndexMode(str, Enum):
    """How to count members when calculating the welcome index."""

    INCLUDE_BOTS = "include_bots"
    EXCLUDE_BOTS = "exclude_bots"


class Locale(str, Enum):
    """Available locales for the dashboard and Discord output."""

    JA_JP = "ja-JP"
    EN_US = "en-US"


class Timezone(str, Enum):
    """Timezone options supported by the runtime."""

    UTC = "UTC"
    JST = "Asia/Tokyo"


class WelcomeButtonTarget(str, Enum):
    """Types of supported welcome buttons."""

    URL = "url"
    CHANNEL = "channel"


class WelcomeButton(BaseModel):
    """Button definition for the welcome embed."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1, max_length=80)
    target: WelcomeButtonTarget
    value: str = Field(..., min_length=1, max_length=256)
    emoji: Optional[str] = Field(
        default=None,
        description="Optional custom emoji identifier (unicode or emoji ID).",
    )


class WelcomeConfig(BaseModel):
    """Configuration payload for the welcome embed flow."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str = Field(..., min_length=1)
    title_template: str = Field(
        default="ようこそ、{username} さん！",
        description="Title template supporting Discord format placeholders.",
    )
    description_template: str = Field(
        default="あなたは **#{member_index}** 人目のメンバーです。",
        description="Description template shown within the embed.",
    )
    member_index_mode: MemberIndexMode = MemberIndexMode.EXCLUDE_BOTS
    join_field_label: str = Field(default="加入日時", max_length=32)
    join_timezone: Timezone = Timezone.JST
    buttons: List[WelcomeButton] = Field(default_factory=list)
    footer_text: str = Field(default="Nyaimlab", max_length=64)
    thread_name_template: Optional[str] = Field(
        default=None,
        description="Optional thread name template if follow-up threads are created.",
    )


class GuidelineTemplate(BaseModel):
    """Stored DM guideline template."""

    model_config = ConfigDict(extra="forbid")

    content: str = Field(
        ..., min_length=1, description="Markdown or plain text sent via DM."
    )
    attachments: List[AnyHttpUrl] = Field(
        default_factory=list,
        description="Optional list of hosted asset URLs attached to the DM.",
    )


class GuidelineTestRequest(BaseModel):
    """Request payload for testing the guideline DM."""

    model_config = ConfigDict(extra="forbid")

    target_user_id: Optional[str] = Field(
        default=None,
        description="Optional Discord user ID to send a preview DM (simulated).",
    )
    dry_run: bool = Field(
        default=True, description="If true, no persistent state is modified."
    )


class VerifyMode(str, Enum):
    BUTTON = "button"
    REACTION = "reaction"


class VerifyConfig(BaseModel):
    """Verification message configuration."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str = Field(..., min_length=1)
    role_id: str = Field(..., min_length=1)
    mode: VerifyMode = VerifyMode.BUTTON
    prompt: str = Field(
        default="ボタンを押して認証を完了してください。",
        max_length=2000,
    )
    message_id: Optional[str] = Field(
        default=None,
        description="Existing Discord message ID to update in-place if present.",
    )


class RoleStyle(str, Enum):
    BUTTONS = "buttons"
    SELECT = "select"
    REACTIONS = "reactions"


class RoleEntry(BaseModel):
    """Definition for a self-assignable role."""

    model_config = ConfigDict(extra="forbid")

    role_id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Optional helper text shown on the dashboard.",
    )
    emoji: Optional[str] = Field(default=None, max_length=64)
    hidden: bool = False
    sort_order: int = Field(default=0)


class RolesConfig(BaseModel):
    """Configuration payload for the role distribution message."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str = Field(..., min_length=1)
    style: RoleStyle
    roles: List[RoleEntry] = Field(default_factory=list)
    message_content: Optional[str] = Field(
        default=None,
        description="Optional plain-text message that accompanies the controls.",
    )


class RoleEmojiMapRequest(BaseModel):
    """Payload for mapping or removing reaction emojis."""

    model_config = ConfigDict(extra="forbid")

    role_id: str
    emoji: Optional[str] = Field(
        default=None,
        description="Emoji to associate. None removes the mapping.",
    )


class RoleRemovalRequest(BaseModel):
    """Request to remove a role configuration entry."""

    model_config = ConfigDict(extra="forbid")

    role_id: Optional[str] = Field(
        default=None,
        description="If omitted the entire role panel is removed.",
    )


class RolesPreviewRequest(BaseModel):
    """Request payload for generating a preview of the role UI."""

    model_config = ConfigDict(extra="forbid")

    locale: Locale = Locale.JA_JP


class IntroduceField(BaseModel):
    """Definition of a modal field for the /introduce command."""

    model_config = ConfigDict(extra="forbid")

    field_id: str = Field(..., min_length=1, max_length=32)
    label: str = Field(..., min_length=1, max_length=45)
    placeholder: Optional[str] = Field(default=None, max_length=100)
    required: bool = Field(default=True)
    enabled: bool = Field(default=True)
    max_length: PositiveInt = Field(default=300, le=1024)


class IntroduceSchema(BaseModel):
    """Collection of fields that make up the introduction modal."""

    model_config = ConfigDict(extra="forbid")

    fields: List[IntroduceField] = Field(default_factory=list)


class IntroduceConfig(BaseModel):
    """Configuration for posting introductions."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str
    mention_role_ids: List[str] = Field(default_factory=list)
    embed_title: str = Field(
        default="自己紹介",
        max_length=256,
    )
    footer_text: Optional[str] = Field(default=None, max_length=64)


class ScrimDay(str, Enum):
    SUN = "sun"
    MON = "mon"
    TUE = "tue"
    WED = "wed"
    THU = "thu"
    FRI = "fri"
    SAT = "sat"


class ScrimRule(BaseModel):
    """Configuration for weekly scrim surveys."""

    model_config = ConfigDict(extra="forbid")

    day: ScrimDay = ScrimDay.SUN
    survey_open_hour: int = Field(default=12, ge=0, le=23)
    survey_close_hour: int = Field(default=22, ge=0, le=23)
    notify_channel_id: str
    min_team_members: PositiveInt = Field(default=3, le=10)

    @field_validator("survey_close_hour")
    @classmethod
    def validate_close(cls, v: int, info: FieldValidationInfo):  # pragma: no cover - simple guard
        data = info.data
        if "survey_open_hour" in data and v == data["survey_open_hour"]:
            raise ValueError("survey_close_hour must differ from survey_open_hour")
        return v


class ScrimConfig(BaseModel):
    """Top-level scrim automation configuration."""

    model_config = ConfigDict(extra="forbid")

    timezone: Timezone = Timezone.JST
    rules: List[ScrimRule] = Field(default_factory=list)
    manager_role_id: Optional[str] = None


class ScrimRunRequest(BaseModel):
    """Manual trigger for the scrim helper."""

    model_config = ConfigDict(extra="forbid")

    dry_run: bool = Field(default=True)


class AuditSearchRequest(BaseModel):
    """Search parameters for audit events."""

    model_config = ConfigDict(extra="forbid")

    since: Optional[datetime] = None
    until: Optional[datetime] = None
    action: Optional[str] = Field(default=None, max_length=64)
    user_id: Optional[str] = Field(default=None)
    channel_id: Optional[str] = Field(default=None)
    limit: PositiveInt = Field(default=100, le=500)


class AuditExportFormat(str, Enum):
    NDJSON = "ndjson"
    CSV = "csv"


class AuditExportRequest(AuditSearchRequest):
    """Export request, extending the search parameters with a format."""

    format: AuditExportFormat = AuditExportFormat.NDJSON


class MemberCountStrategy(str, Enum):
    ALL_MEMBERS = "all_members"
    HUMAN_ONLY = "human_only"
    BOOSTERS_PRIORITY = "boosters_priority"


class SettingsPayload(BaseModel):
    """Guild-level bot configuration that affects multiple features."""

    model_config = ConfigDict(extra="forbid")

    locale: Locale = Locale.JA_JP
    timezone: Timezone = Timezone.JST
    member_index_mode: MemberIndexMode = MemberIndexMode.EXCLUDE_BOTS
    member_count_strategy: MemberCountStrategy = MemberCountStrategy.HUMAN_ONLY
    api_base_url: Optional[AnyHttpUrl] = Field(default=None)
    show_join_alerts: bool = Field(default=True)


class APIResponse(BaseModel):
    """Consistent envelope for successful responses."""

    ok: bool = True
    audit_id: Optional[str] = None
    data: Optional[dict] = None


class ErrorResponse(BaseModel):
    """Consistent envelope for errors."""

    ok: bool = False
    error: str
    audit_id: Optional[str] = None
