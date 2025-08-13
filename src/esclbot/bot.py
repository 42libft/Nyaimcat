# src/esclbot/bot.py
from __future__ import annotations

import os
import io
import re
from typing import Optional, List

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv
import pandas as pd

from .session import Session
from .parser import parse_pasted_text
from .scraper import (
    extract_text_from_url,
    guess_scrim_id,
    find_game_urls_from_parent,
)

# =========================
# Boot & Globals
# =========================
load_dotenv()

INTENTS = discord.Intents.default()
# スラッシュコマンドだけなら message_content は不要
INTENTS.message_content = False

BOT = commands.Bot(command_prefix="!", intents=INTENTS)

# セッションは (guild_id, channel_id, user_id) 毎に管理
_sessions: dict[tuple[int, int, int], Session] = {}

def _key_from_inter(inter: discord.Interaction) -> tuple[int, int, int]:
    return (inter.guild_id or 0, inter.channel_id or 0, inter.user.id)

# =========================
# Helper
# =========================
def _df_to_discord_file(df: pd.DataFrame, filename: str) -> discord.File:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    return discord.File(data, filename=filename)

# =========================
# Classic flow: new → add → finish
# =========================
@BOT.tree.command(name="escl_new", description="ESCL集計: 新しいセッションを開始")
@app_commands.describe(scrim_group="G1〜G5（任意）", scrim_url="親ページのURL（任意）")
async def escl_new(inter: discord.Interaction, scrim_group: Optional[str] = None, scrim_url: Optional[str] = None):
    key = _key_from_inter(inter)
    _sessions[key] = Session(scrim_group=scrim_group or os.getenv("DEFAULT_SCRIM_GROUP") or "", scrim_id=guess_scrim_id(scrim_url))
    await inter.response.send_message(
        f"新しいセッションを開始しました。group=`{_sessions[key].scrim_group or '未指定'}` scrim_id=`{_sessions[key].scrim_id or '不明'}`",
        ephemeral=False,
    )

@BOT.tree.command(name="escl_add", description="1試合分を追加（URL/テキスト/ファイルのどれか）")
@app_commands.describe(url="ゲームページのURL", text="ESCLの『詳細な試合結果をコピー』で得たテキスト", file="txt/tsvファイル（任意）")
async def escl_add(inter: discord.Interaction, url: Optional[str] = None, text: Optional[str] = None, file: Optional[discord.Attachment] = None):
    key = _key_from_inter(inter)
    if key not in _sessions:
        await inter.response.send_message("まず /escl_new でセッションを開始してください。", ephemeral=True)
        return

    await inter.response.defer(thinking=True, ephemeral=False)

    payload: Optional[str] = None
    src = "text"
    if url:
        payload = extract_text_from_url(url)
        src = "url"
    elif text:
        payload = text
        src = "text"
    elif file:
        if file.size > 4 * 1024 * 1024:
            await inter.followup.send("ファイルが大きすぎます（4MBまで）。")
            return
        content = await file.read()
        payload = content.decode("utf-8", errors="ignore")
        src = "file"

    if not payload:
        await inter.followup.send("入力が見つかりませんでした。`url` / `text` / `file` のいずれかを指定してください。")
        return

    try:
        df = parse_pasted_text(payload)
    except Exception as e:
        await inter.followup.send(f"テキスト解析に失敗しました: {e}")
        return

    sess = _sessions[key]
    game_no = len(sess.frames) + 1
    df.insert(0, "game_no", game_no)
    df.insert(0, "scrim_id", sess.scrim_id or (guess_scrim_id(url) if url else ""))
    df.insert(0, "scrim_group", sess.scrim_group)

    sess.frames.append(df)
    await inter.followup.send(f"ゲーム{game_no}を取り込みました（入力: {src}）。現在 {len(sess.frames)}/6")

@BOT.tree.command(name="escl_list", description="セッションの取り込み状況を表示")
async def escl_list(inter: discord.Interaction):
    key = _key_from_inter(inter)
    if key not in _sessions:
        await inter.response.send_message("アクティブなセッションはありません。/escl_new から開始してください。", ephemeral=True)
        return
    sess = _sessions[key]
    await inter.response.send_message(
        f"取り込み済み: {len(sess.frames)} 件 / 6  （group={sess.scrim_group or '未指定'}, scrim_id={sess.scrim_id or '不明'}）",
        ephemeral=False,
    )

@BOT.tree.command(name="escl_clear", description="セッションを破棄してやり直し")
async def escl_clear(inter: discord.Interaction):
    key = _key_from_inter(inter)
    _sessions.pop(key, None)
    await inter.response.send_message("セッションをクリアしました。/escl_new から再開してください。", ephemeral=False)

@BOT.tree.command(name="escl_finish", description="6試合（未満でも可）をまとめてCSVで出力")
async def escl_finish(inter: discord.Interaction):
    key = _key_from_inter(inter)
    if key not in _sessions or not _sessions[key].frames:
        await inter.response.send_message("取り込み済みデータがありません。/escl_add でデータを追加してください。", ephemeral=True)
        return

    await inter.response.defer(thinking=True, ephemeral=False)
    sess = _sessions.pop(key)
    df_all = pd.concat(sess.frames, ignore_index=True)
    fname = f"ESCL_{(sess.scrim_group or 'G?')}_{(sess.scrim_id or 'unknown')}.csv"
    await inter.followup.send(content="CSVを生成しました。", file=_df_to_discord_file(df_all, fname))

# =========================
# URLだけで完結するコマンド（新規）
# =========================
@BOT.tree.command(name="escl_from_parent", description="親ページURLから自動でG1〜G6を収集してCSVを返す（貼付不要）")
@app_commands.describe(parent_url="その日のスクリム親ページURL", scrim_group="G1〜G5（任意）")
async def escl_from_parent(inter: discord.Interaction, parent_url: str, scrim_group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)

    urls = find_game_urls_from_parent(parent_url, limit=6)
    if not urls:
        await inter.followup.send("親ページからゲームURLを見つけられませんでした。URLが正しいか確認してください。")
        return

    rows: List[pd.DataFrame] = []
    sid = guess_scrim_id(parent_url)
    for i, url in enumerate(urls, start=1):
        txt = extract_text_from_url(url)
        if not txt:
            await inter.followup.send(f"ゲーム{i}の抽出に失敗：{url}\n（ページの『詳細な試合結果をコピー』テキストでの貼付なら確実です）")
            return
        df = parse_pasted_text(txt)
        df.insert(0, "game_no", i)
        df.insert(0, "scrim_id", sid or "")
        df.insert(0, "scrim_group", scrim_group or "")
        rows.append(df)

    df_all = pd.concat(rows, ignore_index=True)
    fname = f"ESCL_{(scrim_group or 'G?')}_{(sid or 'unknown')}.csv"
    await inter.followup.send(content="CSVを生成しました。", file=_df_to_discord_file(df_all, fname))

@BOT.tree.command(name="escl_from_urls", description="ゲームURLを1〜6個まとめて渡してCSVを返す（改行/空白区切り）")
@app_commands.describe(urls="ゲームURLを空白または改行で区切って1〜6個（G1〜G6）", scrim_group="G1〜G5（任意）")
async def escl_from_urls(inter: discord.Interaction, urls: str, scrim_group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)

    candidates = [u.strip() for u in re.split(r"[\s,]+", urls) if u.strip()]
    candidates = candidates[:6]
    if not candidates:
        await inter.followup.send("URLが見つかりませんでした。")
        return

    rows: List[pd.DataFrame] = []
    sid = guess_scrim_id(candidates[0])
    for i, url in enumerate(candidates, start=1):
        if not re.match(r"^https?://", url):
            await inter.followup.send(f"URL形式エラー: {url}")
            return
        txt = extract_text_from_url(url)
        if not txt:
            await inter.followup.send(f"ゲーム{i}の抽出に失敗：{url}\n（ページの『詳細な試合結果をコピー』テキストでの貼付なら確実です）")
            return
        df = parse_pasted_text(txt)
        df.insert(0, "game_no", i)
        df.insert(0, "scrim_id", sid or "")
        df.insert(0, "scrim_group", scrim_group or "")
        rows.append(df)

    df_all = pd.concat(rows, ignore_index=True)
    fname = f"ESCL_{(scrim_group or 'G?')}_{(sid or 'unknown')}.csv"
    await inter.followup.send(content="CSVを生成しました。", file=_df_to_discord_file(df_all, fname))

# =========================
# Sync & Run
# =========================
@BOT.event
async def on_ready():
    # 開発中はギルド限定で即時同期（環境変数 GUILD_ID を設定した場合）
    guild_id = os.getenv("GUILD_ID")
    if guild_id and guild_id.isdigit():
        try:
            guild = discord.Object(id=int(guild_id))
            await BOT.tree.sync(guild=guild)
            print(f"Slash commands synced to guild {guild_id}.")
        except Exception as e:
            print(f"Guild sync failed: {e}")
            await BOT.tree.sync()
    else:
        await BOT.tree.sync()
    print(f"Logged in as {BOT.user} (ID: {BOT.user.id})")

def main():
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise SystemExit("DISCORD_TOKEN が設定されていません（.env を確認）")
    BOT.run(token)

if __name__ == "__main__":
    main()

