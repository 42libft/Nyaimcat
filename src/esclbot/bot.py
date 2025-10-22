from __future__ import annotations

import asyncio
import io
import logging
import os
from pathlib import Path
from typing import Optional

import discord
from discord import AllowedMentions, app_commands
from discord.ext import commands
from dotenv import load_dotenv
import pandas as pd
from zoneinfo import ZoneInfo

from .api_scraper import (
    collect_csv_from_parent_url,
    get_scrim_name,
    parse_scrim_group_from_url,
)
from .entry_scheduler import EntryScheduler
from .escl_api import ESCLApiClient
from .reports import (
    aggregate_player_totals,
    aggregate_team_totals,
    safe_filename_component,
)
from .team_store import TeamStore, TeamStoreError

__BOT_VERSION__ = "ESCL-Bot v2.1-cli"

logger = logging.getLogger(__name__)

# ===== Boot =====
load_dotenv()

JST = ZoneInfo("Asia/Tokyo")
DATA_DIR = Path("data")
TEAM_STORE_PATH = DATA_DIR / "team_ids.json"


def _parse_int_env(name: str) -> Optional[int]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return int(raw)
    except ValueError:
        logger.warning("%s 環境変数が整数として解釈できません: %s", name, raw)
        return None


DEFAULT_TEAM_ID = _parse_int_env("DEFAULT_TEAM_ID")


class ESCLDiscordBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = False
        super().__init__(command_prefix="!", intents=intents)
        self.allowed_mentions = AllowedMentions.none()
        self.jst = JST
        self.team_store = TeamStore(TEAM_STORE_PATH, default_team_id=DEFAULT_TEAM_ID)
        self.escl_client = ESCLApiClient(lambda: os.getenv("ESCL_JWT"))
        self.entry_scheduler = EntryScheduler(self.escl_client, timezone=JST)

    async def setup_hook(self) -> None:
        try:
            await self.team_store.load()
        except TeamStoreError as exc:
            logger.error("TeamStore のロードに失敗しました: %s", exc)
            raise
        logger.info("TeamStore を初期化しました。")

    async def close(self) -> None:
        await self.entry_scheduler.shutdown()
        await self.escl_client.aclose()
        await super().close()

BOT = ESCLDiscordBot()

GUILD_ID_STR = os.getenv("GUILD_ID")
GUILD_OBJ = discord.Object(id=int(GUILD_ID_STR)) if (GUILD_ID_STR and GUILD_ID_STR.isdigit()) else None

def _df_to_discord_file(df: pd.DataFrame, filename: str) -> discord.File:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    return discord.File(data, filename=filename)


# ===== Commands =====
@BOT.tree.command(name="version", description="Botのバージョン表示（動いているコード確認用）")
async def version(inter: discord.Interaction):
    await inter.response.send_message(f"{__BOT_VERSION__}", ephemeral=True)


@BOT.tree.command(name="escl_from_parent_csv", description="グループURL1本からAPI直叩きで6試合CSV（生データALL_GAMES相当）")
@app_commands.describe(parent_url="グループページURL（/scrims/<scrim>/<group>）", group="例: G5, G8 など（任意）")
async def escl_from_parent_csv(inter: discord.Interaction, parent_url: str, group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)
    try:
        df_all = await asyncio.to_thread(collect_csv_from_parent_url, parent_url, (group or ""), 6)
    except Exception as e:
        await inter.followup.send(f"取得に失敗しました: {e}")
        return

    scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)
    scrim_name = get_scrim_name(scrim_uuid, group_uuid) or "ESCL_Scrim"
    title = f"{safe_filename_component(scrim_name)}_{safe_filename_component(group or '')}".rstrip("_")
    fname = f"{title}.csv"

    await inter.followup.send(
        content="API直叩きでCSVを生成しました。（生データALL_GAMES相当）",
        file=_df_to_discord_file(df_all, fname),
    )

@BOT.tree.command(name="escl_from_parent_xlsx", description="API直叩きでExcel（GAME1..6=生データ、ALL_GAMES=生データ、TEAM_TOTALS=チーム合計）")
@app_commands.describe(parent_url="グループページURL（/scrims/<scrim>/<group>）", group="例: G5, G8 など（任意）")
async def escl_from_parent_xlsx(inter: discord.Interaction, parent_url: str, group: Optional[str] = None):
    await inter.response.defer(thinking=True, ephemeral=False)
    try:
        df_all = await asyncio.to_thread(collect_csv_from_parent_url, parent_url, (group or ""), 6)
    except Exception as e:
        await inter.followup.send(f"取得に失敗しました: {e}")
        return

    # 集計テーブル
    team_totals = aggregate_team_totals(df_all)

    mem = io.BytesIO()
    with pd.ExcelWriter(mem, engine="xlsxwriter") as writer:
        # 各試合シート（RAW）
        for g in sorted(set(df_all["game"].dropna().astype(int))):
            dfg = df_all[df_all["game"] == g]
            dfg.to_excel(writer, sheet_name=f"GAME{g}", index=False)

        # プレイヤー合計（6試合分）
        player_totals = aggregate_player_totals(df_all)
        player_totals.to_excel(writer, sheet_name="ALL_GAMES", index=False)

        # 新要件：チーム合計
        team_totals.to_excel(writer, sheet_name="TEAM_TOTALS", index=False)

    mem.seek(0)

    scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)
    scrim_name = get_scrim_name(scrim_uuid, group_uuid) or "ESCL_Scrim"
    title = f"{safe_filename_component(scrim_name)}_{safe_filename_component(group or '')}".rstrip("_")
    fname = f"{title}.xlsx"

    await inter.followup.send(
        content=f"Excelを生成しました。（{__BOT_VERSION__} / ALL_GAMES=生データ / TEAM_TOTALS=チーム合計）",
        file=discord.File(fp=mem, filename=fname),
    )

# ===== Sync & Run =====
@BOT.event
async def on_ready():
    print(f"Booting {__BOT_VERSION__} ...")
    if GUILD_OBJ is not None:
        BOT.tree.copy_global_to(guild=GUILD_OBJ)
        cmds = await BOT.tree.sync(guild=GUILD_OBJ)
        print(f"Guild sync -> {GUILD_OBJ.id}, count={len(cmds)}")
        BOT.tree.clear_commands(guild=None)
        await BOT.tree.sync(guild=None)
        print("Global commands cleared.")
    else:
        cmds = await BOT.tree.sync()
        print(f"Global sync (no GUILD_ID). count={len(cmds)}")

def main():
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise SystemExit("DISCORD_TOKEN が設定されていません（.env を確認）")
    BOT.run(token)

if __name__ == "__main__":
    main()
