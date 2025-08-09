from __future__ import annotations
import io
import os
import re
from typing import Optional, Tuple

import discord
from discord import app_commands
from discord.ext import commands

from .session import Session
from .parser import parse_pasted_text
from .scraper import extract_text_from_url, guess_scrim_id

from dotenv import load_dotenv
import pandas as pd

load_dotenv()
INTENTS = discord.Intents.default()
BOT = commands.Bot(command_prefix="!", intents=INTENTS)

_sessions = {}  # key: (guild_id, channel_id, user_id) -> Session

def key_from_i(inter: discord.Interaction) -> Tuple[int, int, int]:
    gid = inter.guild_id or 0
    cid = inter.channel_id or 0
    uid = inter.user.id
    return (gid, cid, uid)

@BOT.tree.command(name="escl_new", description="ESCL集計: 新しいセッションを開始")
@app_commands.describe(scrim_group="G1〜G5 (任意)", scrim_url="スクリムURL (任意)")
async def escl_new(inter: discord.Interaction, scrim_group: Optional[str] = None, scrim_url: Optional[str] = None):
    if not scrim_group:
        scrim_group = os.getenv("DEFAULT_SCRIM_GROUP") or None
    _sessions[key_from_i(inter)] = Session(scrim_group=scrim_group, scrim_id=guess_scrim_id(scrim_url))
    await inter.response.send_message(f"新規セッション開始。group={scrim_group or '-'} id={guess_scrim_id(scrim_url) or '-'}", ephemeral=True)

@BOT.tree.command(name="escl_add", description="ESCL集計: URL / テキスト / 添付ファイルで1ゲーム追加")
@app_commands.describe(url="ゲームのURL（任意）", text="“詳細結果をコピー”のテキスト（任意）", file="テキストファイル（任意）")
async def escl_add(inter: discord.Interaction, url: Optional[str] = None, text: Optional[str] = None, file: Optional[discord.Attachment] = None):
    k = key_from_i(inter)
    if k not in _sessions:
        _sessions[k] = Session()
    sess = _sessions[k]

    sources = [bool(url), bool(text and text.strip()), bool(file)]
    if sum(sources) != 1:
        await inter.response.send_message("URL / テキスト / ファイル のいずれか**1つ**だけ指定してください。", ephemeral=True)
        return

    raw_text = None
    if url:
        if not re.match(r"^https?://", url.strip()):
            await inter.response.send_message("URLの形式が不正です。", ephemeral=True)
            return
        extracted = await inter.client.loop.run_in_executor(None, extract_text_from_url, url.strip())
        if extracted is None:
            await inter.response.send_message("URLからコピー用テキストを取得できませんでした。ページで「詳細な試合結果をコピー」→テキスト貼付で再試行してください。", ephemeral=True)
            return
        raw_text = extracted
        if not sess.scrim_id:
            sess.scrim_id = guess_scrim_id(url.strip())
    elif text and text.strip():
        raw_text = text
    elif file:
        if file.size > 3 * 1024 * 1024:
            await inter.response.send_message("ファイルが大きすぎます（3MBまで）。", ephemeral=True)
            return
        buf = await file.read()
        raw_text = buf.decode("utf-8", errors="replace")
    else:
        await inter.response.send_message("入力が空です。", ephemeral=True)
        return

    try:
        df = parse_pasted_text(raw_text)
    except Exception as e:
        await inter.response.send_message(f"解析失敗: {e}", ephemeral=True)
        return

    game_no = len(sess.games) + 1
    df.insert(0, "game_no", game_no)
    df.insert(0, "scrim_id", sess.scrim_id or "")
    df.insert(0, "scrim_group", sess.scrim_group or "")
    sess.add_game(df)

    await inter.response.send_message(f"ゲーム{game_no}を取り込みました。現在 {len(sess.games)}/6", ephemeral=True)

@BOT.tree.command(name="escl_list", description="ESCL集計: 取り込み状況を表示")
async def escl_list(inter: discord.Interaction):
    k = key_from_i(inter)
    sess = _sessions.get(k)
    if not sess:
        await inter.response.send_message("セッションは未作成です。/escl_new を実行してください。", ephemeral=True)
        return
    sizes = [len(g) for g in sess.games]
    await inter.response.send_message(f"group={sess.scrim_group or '-'} id={sess.scrim_id or '-'} / 取り込み {len(sess.games)}件 / 行数: {sizes}", ephemeral=True)

@BOT.tree.command(name="escl_clear", description="ESCL集計: セッションを初期化")
async def escl_clear(inter: discord.Interaction):
    _sessions.pop(key_from_i(inter), None)
    await inter.response.send_message("セッションをクリアしました。", ephemeral=True)

@BOT.tree.command(name="escl_finish", description="ESCL集計: 6試合のCSVを出力")
async def escl_finish(inter: discord.Interaction):
    k = key_from_i(inter)
    sess = _sessions.get(k)
    if not sess or not sess.games:
        await inter.response.send_message("データがありません。/escl_add で取り込んでください。", ephemeral=True)
        return

    if len(sess.games) < 6:
        await inter.response.send_message(f"まだ {len(sess.games)}/6。続けて /escl_add を実行してください。", ephemeral=True)
        return

    df_all = pd.concat(sess.games, ignore_index=True)
    buf = io.StringIO()
    df_all.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    fname = f"ESCL_{(sess.scrim_group or 'G?')}_{(sess.scrim_id or 'unknown')}.csv"
    await inter.response.send_message(content="CSVを生成しました。", file=discord.File(data, filename=fname), ephemeral=False)

@BOT.event
async def on_ready():
    await BOT.tree.sync()
    print(f"Logged in as {BOT.user} (ID: {BOT.user.id})")

def main():
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise SystemExit("DISCORD_TOKEN is not set. See .env.example")
    BOT.run(token)

if __name__ == "__main__":
    main()
