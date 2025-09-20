"""Discord bot entry point for ESCL scrim collection commands."""
from __future__ import annotations

import io
import os
import re
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from .collector import CollectorError, CollectorResult, ScrimCollector
from .session import SessionKey

load_dotenv()

INTENTS = discord.Intents.default()
INTENTS.message_content = False

BOT = commands.Bot(command_prefix="!", intents=INTENTS)
COLLECTOR = ScrimCollector(default_scrim_group=os.getenv("DEFAULT_SCRIM_GROUP", ""))


def _session_key(inter: discord.Interaction) -> SessionKey:
    return SessionKey(
        guild_id=inter.guild_id or 0,
        channel_id=inter.channel_id or 0,
        user_id=inter.user.id,
    )


def _result_to_discord_file(result: CollectorResult) -> discord.File:
    buffer = io.StringIO()
    result.dataframe.to_csv(buffer, index=False)
    payload = io.BytesIO(buffer.getvalue().encode("utf-8"))
    return discord.File(payload, filename=result.filename)


async def _reply_error(inter: discord.Interaction, exc: CollectorError) -> None:
    message = str(exc)
    if inter.response.is_done():
        await inter.followup.send(message, ephemeral=True)
    else:
        await inter.response.send_message(message, ephemeral=True)


@BOT.tree.command(name="escl_new", description="ESCL集計: 新しいセッションを開始")
@app_commands.describe(scrim_group="G1〜G5（任意）", scrim_url="親ページのURL（任意）")
async def escl_new(
    inter: discord.Interaction,
    scrim_group: Optional[str] = None,
    scrim_url: Optional[str] = None,
) -> None:
    session = COLLECTOR.start_session(_session_key(inter), scrim_group=scrim_group, scrim_url=scrim_url)
    await inter.response.send_message(
        f"新しいセッションを開始しました。group=`{session.scrim_group or '未指定'}` "
        f"scrim_id=`{session.scrim_id or '不明'}`",
        ephemeral=False,
    )


@BOT.tree.command(name="escl_add", description="1試合分を追加（URL/テキスト/ファイルのどれか）")
@app_commands.describe(
    url="ゲームページのURL",
    text="ESCLの『詳細な試合結果をコピー』で得たテキスト",
    file="txt/tsvファイル（任意）",
)
async def escl_add(
    inter: discord.Interaction,
    url: Optional[str] = None,
    text: Optional[str] = None,
    file: Optional[discord.Attachment] = None,
) -> None:
    key = _session_key(inter)

    attachment_bytes: Optional[bytes] = None
    if file is not None:
        if file.size and file.size > 4 * 1024 * 1024:
            await inter.response.send_message("ファイルが大きすぎます（4MBまで）。", ephemeral=True)
            return
        attachment_bytes = await file.read()

    await inter.response.defer(thinking=True, ephemeral=False)
    try:
        record = await COLLECTOR.add_game(
            key,
            url=url,
            text=text,
            attachment_bytes=attachment_bytes,
        )
        session = COLLECTOR.summarise(key)
    except CollectorError as exc:
        await _reply_error(inter, exc)
        return

    await inter.followup.send(
        f"ゲーム{record.number}を取り込みました（入力: {record.source}）。現在 {session.total_games}/6"
    )


@BOT.tree.command(name="escl_list", description="セッションの取り込み状況を表示")
async def escl_list(inter: discord.Interaction) -> None:
    key = _session_key(inter)
    try:
        session = COLLECTOR.summarise(key)
    except CollectorError as exc:
        await _reply_error(inter, exc)
        return

    await inter.response.send_message(
        "取り込み済み: {count} 件 / 6  （group={group}, scrim_id={scrim_id})".format(
            count=session.total_games,
            group=session.scrim_group or "未指定",
            scrim_id=session.scrim_id or "不明",
        ),
        ephemeral=False,
    )


@BOT.tree.command(name="escl_clear", description="セッションを破棄してやり直し")
async def escl_clear(inter: discord.Interaction) -> None:
    COLLECTOR.clear_session(_session_key(inter))
    await inter.response.send_message("セッションをクリアしました。/escl_new から再開してください。", ephemeral=False)


@BOT.tree.command(name="escl_finish", description="6試合（未満でも可）をまとめてCSVで出力")
async def escl_finish(inter: discord.Interaction) -> None:
    key = _session_key(inter)
    await inter.response.defer(thinking=True, ephemeral=False)
    try:
        result = COLLECTOR.finish_session(key)
    except CollectorError as exc:
        await _reply_error(inter, exc)
        return

    await inter.followup.send(content="CSVを生成しました。", file=_result_to_discord_file(result))


@BOT.tree.command(
    name="escl_from_parent",
    description="親ページURLから自動でG1〜G6を収集してCSVを返す（貼付不要）",
)
@app_commands.describe(parent_url="その日のスクリム親ページURL", scrim_group="G1〜G5（任意）")
async def escl_from_parent(
    inter: discord.Interaction,
    parent_url: str,
    scrim_group: Optional[str] = None,
) -> None:
    await inter.response.defer(thinking=True, ephemeral=False)
    try:
        result = await COLLECTOR.collect_from_parent(parent_url, scrim_group=scrim_group)
    except CollectorError as exc:
        await _reply_error(inter, exc)
        return

    await inter.followup.send(content="CSVを生成しました。", file=_result_to_discord_file(result))


@BOT.tree.command(
    name="escl_from_urls",
    description="ゲームURLを1〜6個まとめて渡してCSVを返す（改行/空白区切り）",
)
@app_commands.describe(urls="ゲームURLを空白または改行で区切って1〜6個（G1〜G6）", scrim_group="G1〜G5（任意）")
async def escl_from_urls(
    inter: discord.Interaction,
    urls: str,
    scrim_group: Optional[str] = None,
) -> None:
    await inter.response.defer(thinking=True, ephemeral=False)
    candidates = [u.strip() for u in re.split(r"[\s,]+", urls) if u.strip()]
    try:
        result = await COLLECTOR.collect_from_urls(candidates, scrim_group=scrim_group)
    except CollectorError as exc:
        await _reply_error(inter, exc)
        return

    await inter.followup.send(content="CSVを生成しました。", file=_result_to_discord_file(result))


@BOT.event
async def on_ready() -> None:
    guild_id = os.getenv("GUILD_ID")
    if guild_id and guild_id.isdigit():
        guild = discord.Object(id=int(guild_id))
        BOT.tree.copy_global_to(guild=guild)
        synced = await BOT.tree.sync(guild=guild)
        print(f"Slash commands synced to guild {guild_id}. count={len(synced)}")
    else:
        synced = await BOT.tree.sync()
        print(f"Slash commands synced globally. count={len(synced)}")

    print("Loaded commands:", [command.name for command in BOT.tree.get_commands()])
    if BOT.user:
        print(f"Logged in as {BOT.user} (ID: {BOT.user.id})")


def main() -> None:
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise SystemExit("DISCORD_TOKEN が設定されていません（.env を確認）")
    BOT.run(token)


if __name__ == "__main__":
    main()
