"""Generate preview payloads for welcome messages (embed/card)."""
from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

from zoneinfo import ZoneInfo

from .schemas import (
    WelcomeCardConfig,
    WelcomeConfig,
    WelcomeEmbedPreview,
    WelcomeEmbedPreviewField,
    WelcomeMode,
    WelcomePreview,
    WelcomePreviewRequest,
)

DEFAULT_AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/0.png"
REPO_ROOT = Path(__file__).resolve().parents[2]
BOT_RUNTIME_DIR = REPO_ROOT / "bot-runtime"
CARD_PREVIEW_SCRIPT = BOT_RUNTIME_DIR / "src" / "scripts" / "renderWelcomeCardPreview.ts"


def _assign_alias(values: Dict[str, str], key: str, value: str) -> None:
    values[key] = value
    snake = "".join(f"_{char.lower()}" if char.isupper() else char for char in key).lstrip("_")
    camel = (
        "".join(
            part.capitalize() if index > 0 else part
            for index, part in enumerate(key.split("_"))
        )
        if "_" in key
        else key
    )
    values[snake] = value
    values[camel] = value


def _build_template_values(
    config: WelcomeConfig,
    request: WelcomePreviewRequest,
) -> Dict[str, str]:
    member = request.member
    username = member.display_name or member.username
    values: Dict[str, str] = {}

    _assign_alias(values, "username", username)
    _assign_alias(values, "displayName", username)
    _assign_alias(values, "mention", "@PreviewUser")
    _assign_alias(values, "guildName", request.guild_name)
    _assign_alias(values, "memberIndex", str(member.member_index))
    _assign_alias(values, "guideUrl", "")
    _assign_alias(values, "rolesChannelMention", "")
    _assign_alias(values, "staffRoleMentions", "")

    if config.buttons:
        first_button = next((btn for btn in config.buttons if btn.target == "channel"), None)
        if first_button:
            channel_link = f"https://discord.com/channels/preview/{first_button.value}"
            _assign_alias(values, "rolesChannelLink", channel_link)

    return values


def _render_template_safe(template: str | None, values: Dict[str, str]) -> str:
    if not template:
        return ""

    pattern = re.compile(r"\{\{\s*([\w_]+)\s*\}\}|\{([\w_]+)\}")

    def replace(match: re.Match[str]) -> str:
        key1, key2 = match.group(1), match.group(2)
        key = key1 or key2
        if not key:
            return match.group(0)
        return values.get(key, match.group(0))

    return pattern.sub(replace, template)


def _format_join_label(config: WelcomeConfig) -> Tuple[str, str]:
    label = config.join_field_label or "加入日時"
    timezone = config.join_timezone or "Asia/Tokyo"
    try:
        tz = ZoneInfo(timezone)
    except Exception:
        tz = ZoneInfo("UTC")
        timezone = "UTC"
    now = datetime.now(tz)
    formatted = now.strftime("%Y-%m-%d %H:%M")
    return label, f"{formatted} ({timezone})"


def _build_embed_preview(
    config: WelcomeConfig,
    values: Dict[str, str],
    avatar_url: str | None,
) -> WelcomeEmbedPreview:
    title_template = config.title_template or "ようこそ、{{username}} さん！"
    description_template = (
        config.description_template
        or "Nyaimlabへようこそ！あなたは **#{{member_index}}** 人目のメンバーです。"
    )

    title = _render_template_safe(title_template, values).strip()
    description = _render_template_safe(description_template, values).strip()
    if not description:
        description = (
            "Nyaimlabへようこそ！\n"
            f"あなたは **#{values.get('member_index', values.get('memberIndex', '0'))}** 人目のメンバーです。"
        )

    join_label, join_value = _format_join_label(config)

    footer_text = config.footer_text or "Nyaimlab"

    return WelcomeEmbedPreview(
        title=title,
        description=description,
        footer_text=footer_text,
        fields=[WelcomeEmbedPreviewField(name=join_label, value=join_value)],
        thumbnail_url=avatar_url or DEFAULT_AVATAR_URL,
    )


def _render_card_preview(
    card: WelcomeCardConfig,
    values: Dict[str, str],
    avatar_url: str | None,
) -> str:
    payload = {
        "card": card.model_dump(mode="json"),
        "templateValues": values,
        "avatarUrl": avatar_url or DEFAULT_AVATAR_URL,
        "assetsBasePath": str(BOT_RUNTIME_DIR),
    }

    command = [
        "node",
        "-r",
        "ts-node/register/transpile-only",
        str(CARD_PREVIEW_SCRIPT),
    ]

    env = os.environ.copy()
    env.setdefault("TS_NODE_PROJECT", str(BOT_RUNTIME_DIR / "tsconfig.json"))

    try:
        completed = subprocess.run(
            command,
            cwd=str(BOT_RUNTIME_DIR),
            input=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            env=env,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore")
        raise RuntimeError(f"カードプレビュー生成に失敗しました: {stderr}") from exc
    except OSError as exc:
        raise RuntimeError(f"Node.js 実行に失敗しました: {exc}") from exc

    return completed.stdout.decode("utf-8").strip()


def generate_welcome_preview(request: WelcomePreviewRequest) -> WelcomePreview:
    config = request.config
    values = _build_template_values(config, request)
    content_template = config.message_template or "{{mention}}"
    content = _render_template_safe(content_template, values).strip() or None
    avatar_url = request.member.avatar_url or DEFAULT_AVATAR_URL

    if config.mode == WelcomeMode.CARD:
        if not config.card:
            raise ValueError("カードモードが選択されていますが card 設定が存在しません。")

        image_base64 = _render_card_preview(config.card, values, avatar_url)
        return WelcomePreview(
            mode=config.mode,
            content=content,
            card_base64=image_base64,
        )

    embed_preview = _build_embed_preview(config, values, avatar_url)
    return WelcomePreview(
        mode=WelcomeMode.EMBED,
        content=content,
        embed=embed_preview,
    )
