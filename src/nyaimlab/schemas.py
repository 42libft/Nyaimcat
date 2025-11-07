"""Pydantic models for the Nyaimlab admin API."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

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


class WelcomeMode(str, Enum):
    """Supported presentation modes for the welcome message."""

    EMBED = "embed"
    CARD = "card"


class WelcomeCardConfig(BaseModel):
    """Card generation settings when using the canvas-based welcome mode."""

    model_config = ConfigDict(extra="forbid")

    background_image: str = Field(
        ...,
        min_length=1,
        description="Path or URL to the background image rendered behind the welcome card.",
    )
    font_path: Optional[str] = Field(
        default=None,
        description="Optional font file path used when drawing text onto the welcome card.",
    )
    title_template: str = Field(
        default="Welcome to {{guild_name}}",
        max_length=160,
        description="Primary heading rendered under the avatar. Supports template variables.",
    )
    subtitle_template: str = Field(
        default="Member #{{member_index}}",
        max_length=160,
        description="Secondary heading rendered under the title. Supports template variables.",
    )
    body_template: Optional[str] = Field(
        default="We are glad to have you here, {{username}}!",
        max_length=400,
        description="Optional body text rendered under the subtitle. Supports template variables.",
    )
    text_color: str = Field(
        default="#ffffff",
        min_length=1,
        description="Primary text color. Accepts hex or CSS color strings.",
    )
    accent_color: str = Field(
        default="#fee75c",
        min_length=1,
        description="Accent color used for highlighted text such as the member index.",
    )
    overlay_color: Optional[str] = Field(
        default="rgba(0, 0, 0, 0.45)",
        description="Optional overlay color applied on top of the background image.",
    )
    avatar_border_color: Optional[str] = Field(
        default=None,
        description="Optional border color drawn around the circular avatar.",
    )
    font_family: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Optional CSS font-family used when rendering the welcome card.",
    )
    avatar_offset_x: int = Field(
        default=0,
        ge=-512,
        le=512,
        description="Horizontal offset applied to the avatar centre relative to the canvas midpoint.",
    )
    avatar_offset_y: int = Field(
        default=-96,
        ge=-576,
        le=576,
        description="Vertical offset applied to the avatar centre relative to the canvas midpoint.",
    )
    title_offset_x: int = Field(
        default=0,
        ge=-512,
        le=512,
        description="Horizontal offset applied to the title text baseline relative to the canvas midpoint.",
    )
    title_offset_y: int = Field(
        default=20,
        ge=-200,
        le=400,
        description="Vertical spacing between the avatar bottom and the title.",
    )
    title_font_size: int = Field(
        default=64,
        ge=12,
        le=120,
        description="Base font size (px) for the title text.",
    )
    subtitle_offset_x: int = Field(
        default=0,
        ge=-512,
        le=512,
        description="Horizontal offset applied to the subtitle text relative to the canvas midpoint.",
    )
    subtitle_offset_y: int = Field(
        default=50,
        ge=-200,
        le=400,
        description="Vertical spacing between the title and subtitle.",
    )
    subtitle_font_size: int = Field(
        default=44,
        ge=12,
        le=100,
        description="Base font size (px) for the subtitle text.",
    )
    body_offset_x: int = Field(
        default=0,
        ge=-512,
        le=512,
        description="Horizontal offset applied to the body text block relative to the canvas midpoint.",
    )
    body_offset_y: int = Field(
        default=50,
        ge=-400,
        le=600,
        description="Vertical spacing between the subtitle and the start of the body text.",
    )
    body_font_size: int = Field(
        default=28,
        ge=12,
        le=80,
        description="Base font size (px) for the body text.",
    )

    @field_validator("font_path", "font_family", mode="before")
    @classmethod
    def _normalize_optional_font_fields(
        cls, value: Any
    ) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        raise TypeError("font_path and font_family must be strings.")

class WelcomePreviewMember(BaseModel):
    """Sample member information used when generating previews."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(default="PreviewUser", max_length=64)
    display_name: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Optional display name if differs from username.",
    )
    avatar_url: Optional[str] = Field(
        default=None,
        description="Optional avatar URL used when rendering the preview.",
    )
    member_index: PositiveInt = Field(default=128)


class WelcomeConfig(BaseModel):
    """Configuration payload for the welcome embed flow."""

    model_config = ConfigDict(extra="forbid")

    channel_id: str = Field(..., min_length=1)
    title_template: str = Field(
        default="ようこそ、{username} さん！",
        min_length=1,
        description="Title template supporting Discord format placeholders.",
    )
    description_template: str = Field(
        default="あなたは **#{member_index}** 人目のメンバーです。",
        description="Description template shown within the embed.",
    )
    message_template: str = Field(
        default="{{mention}}",
        max_length=2000,
        description="Message content template sent alongside the welcome message.",
    )
    mode: WelcomeMode = WelcomeMode.EMBED
    member_index_mode: MemberIndexMode = MemberIndexMode.EXCLUDE_BOTS
    join_field_label: str = Field(default="加入日時", max_length=32)
    join_timezone: Timezone = Timezone.JST
    buttons: List[WelcomeButton] = Field(default_factory=list)
    footer_text: str = Field(default="Nyaimlab", max_length=64)
    thread_name_template: Optional[str] = Field(
        default=None,
        description="Optional thread name template if follow-up threads are created.",
    )
    card: Optional[WelcomeCardConfig] = Field(
        default=None,
        description="Canvas-based card configuration when mode is set to `card`.",
    )

    @field_validator("title_template", mode="before")
    @classmethod
    def _sanitize_embed_title(cls, value: Any) -> Any:
        if value is None:
            return value
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                raise ValueError("title_template must not be empty.")
            return trimmed
        raise TypeError("title_template must be a string.")


class WelcomeEmbedPreviewField(BaseModel):
    """Field representation returned when previewing embed mode."""

    name: str
    value: str


class WelcomeEmbedPreview(BaseModel):
    """Preview payload for embed mode."""

    title: str
    description: str
    footer_text: str
    fields: List[WelcomeEmbedPreviewField]
    color: int = 0x5865F2
    thumbnail_url: Optional[str] = None


class WelcomePreview(BaseModel):
    """Union preview response for embed/card modes."""

    mode: WelcomeMode
    content: Optional[str] = None
    embed: Optional[WelcomeEmbedPreview] = None
    card_base64: Optional[str] = Field(
        default=None,
        description="PNG data encoded as base64 when mode is `card`.",
    )


class WelcomePreviewRequest(BaseModel):
    """Request body for generating welcome message previews."""

    model_config = ConfigDict(extra="forbid")

    config: WelcomeConfig
    member: WelcomePreviewMember = Field(default_factory=WelcomePreviewMember)
    guild_name: str = Field(default="Nyaimlab", max_length=100)


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
    emoji: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Reaction modeで使用するカスタム絵文字。省略時は✅。",
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

    channel_id: str
    style: RoleStyle
    roles: List[RoleEntry] = Field(default_factory=list)
    message_id: Optional[str] = Field(
        default=None,
        description="既存メッセージを更新する場合の Discord message ID。",
    )
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
    HUMAN_ONLY = "human_only"
    INCLUDE_BOTS = "include_bots"


class SettingsPayload(BaseModel):
    """Guild-level bot configuration that affects multiple features."""

    model_config = ConfigDict(extra="forbid")

    locale: Locale = Locale.JA_JP
    timezone: Timezone = Timezone.JST
    member_index_mode: MemberIndexMode = MemberIndexMode.EXCLUDE_BOTS
    member_count_strategy: MemberCountStrategy = MemberCountStrategy.HUMAN_ONLY
    api_base_url: Optional[AnyHttpUrl] = Field(default=None)
    show_join_alerts: bool = Field(default=True)

    @field_validator("member_count_strategy", mode="before")
    @classmethod
    def _normalize_member_count_strategy(
        cls, value: Any
    ) -> MemberCountStrategy:
        if value is None:
            return MemberCountStrategy.HUMAN_ONLY
        if isinstance(value, MemberCountStrategy):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in ("human_only", "include_bots"):
                return MemberCountStrategy(normalized)
            if normalized in ("all_members", "boosters_priority"):
                return MemberCountStrategy.INCLUDE_BOTS
        raise ValueError(
            "member_count_strategy must be either human_only or include_bots."
        )


class RagMode(str, Enum):
    HELP = "help"
    COACH = "coach"
    CHAT = "chat"


class RagPromptsConfig(BaseModel):
    """Prompt templates used when generating responses per mode."""

    model_config = ConfigDict(extra="forbid")

    base: str = Field(
        ...,
        description="全モード共通で付与するベースプロンプト。",
    )
    help: str = Field(..., description="ヘルプモード専用の追加プロンプト。")
    coach: str = Field(..., description="コーチモード専用の追加プロンプト。")
    chat: str = Field(..., description="雑談モード専用の追加プロンプト。")


class RagFeelingsConfig(BaseModel):
    """Emotion and response frequency parameters for the bot."""

    model_config = ConfigDict(extra="forbid")

    excitement: float = Field(default=0.5, ge=0.0, le=1.0)
    empathy: float = Field(default=0.5, ge=0.0, le=1.0)
    probability: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description="自発発話の基本確率。",
    )
    cooldown_minutes: float = Field(
        default=15.0, ge=0.0, description="自発発話後の待機時間（分）。"
    )
    default_mode: RagMode = RagMode.CHAT


class RagShortTermConfig(BaseModel):
    """Short term memory fine-tuning."""

    model_config = ConfigDict(extra="forbid")

    excluded_channels: List[str] = Field(
        default_factory=list,
        description="短期記憶から除外するチャンネル ID のリスト。",
    )


class RagConfig(BaseModel):
    """Top-level configurable properties for the RAG service."""

    model_config = ConfigDict(extra="forbid")

    prompts: RagPromptsConfig
    feelings: RagFeelingsConfig = Field(default_factory=RagFeelingsConfig)
    short_term: RagShortTermConfig = Field(default_factory=RagShortTermConfig)


class RagKnowledgeEntry(BaseModel):
    """Manual knowledge entry that can be persisted to Markdown."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)


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
