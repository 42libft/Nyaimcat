from __future__ import annotations
import os, io, asyncio
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv
import pandas as pd

from .api_scraper import (
    collect_csv_from_parent_url,
    get_scrim_name,
    parse_scrim_group_from_url,
)

__BOT_VERSION__ = "ESCL-Bot v1.5-raw+aggregates"

# ===== Boot =====
load_dotenv()
INTENTS = discord.Intents.default()
INTENTS.message_content = False
BOT = commands.Bot(command_prefix="!", intents=INTENTS)

GUILD_ID_STR = os.getenv("GUILD_ID")
GUILD_OBJ = discord.Object(id=int(GUILD_ID_STR)) if (GUILD_ID_STR and GUILD_ID_STR.isdigit()) else None

def _safe_name(s: str) -> str:
    return "".join(c for c in s if c not in r'\/:*?"<>|').strip()

def _df_to_discord_file(df: pd.DataFrame, filename: str) -> discord.File:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    return discord.File(data, filename=filename)

# ===== 集計ヘルパー（TEAM_TOTALSを作る） =====
def _aggregate_team_totals(df_all: pd.DataFrame) -> pd.DataFrame:
    df = df_all.copy()

    # 数値列を確実に用意・数値化
    num_cols = ["kills","assists","damage","shots","hits","headshots","survival_time"]
    for c in num_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
        else:
            df[c] = 0

    # team_num を安定ソート用に整形
    if "team_num" not in df.columns:
        df["team_num"] = None
    else:
        def _to_int_or_none(x):
            try:
                return int(x)
            except Exception:
                return None
        df["team_num"] = df["team_num"].apply(_to_int_or_none)

    # 集計
    grouped = df.groupby(["team_num","team_name"], dropna=False).agg({
        "kills":"sum",
        "assists":"sum",
        "damage":"sum",
        "shots":"sum",
        "hits":"sum",
        "headshots":"sum",
        "survival_time":"sum",
    }).reset_index()

    # 精度は合計から再計算（%）
    grouped["accuracy"] = (grouped["hits"] / grouped["shots"]).where(grouped["shots"]>0, 0) * 100.0
    grouped["headshots_accuracy"] = (grouped["headshots"] / grouped["hits"]).where(grouped["hits"]>0, 0) * 100.0

    # 小数整形
    grouped["accuracy"] = grouped["accuracy"].round(2)
    grouped["headshots_accuracy"] = grouped["headshots_accuracy"].round(2)

    # 並び：team_num → team_name
    grouped["_team_num_sort"] = grouped["team_num"].apply(
        lambda x: x if isinstance(x, int) else 10**9
    )
    grouped = grouped.sort_values(
        by=["_team_num_sort", "team_name"],
        na_position="last"
    ).drop(columns="_team_num_sort").reset_index(drop=True)

    # 列順
    out_cols = [
        "team_name","team_num",
        "kills","assists","damage","shots","hits","accuracy",
        "headshots","headshots_accuracy","survival_time"
    ]
    for c in out_cols:
        if c not in grouped.columns:
            grouped[c] = None
    return grouped[out_cols]


def _aggregate_player_totals(df_all: pd.DataFrame) -> pd.DataFrame:
    df = df_all.copy()

    num_cols = ["kills","assists","damage","shots","hits","headshots","survival_time"]
    for c in num_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
        else:
            df[c] = 0

    if "placement" in df.columns:
        df["placement"] = pd.to_numeric(df["placement"], errors="coerce")
    else:
        df["placement"] = None

    for key in ("player_name", "team_name", "team_num"):
        if key not in df.columns:
            df[key] = None

    df["_games_played"] = 1

    agg_map = {
        "_games_played": "sum",
        "kills": "sum",
        "assists": "sum",
        "damage": "sum",
        "shots": "sum",
        "hits": "sum",
        "headshots": "sum",
        "survival_time": "sum",
        "placement": "mean",
    }

    grouped = df.groupby(["player_name","team_name","team_num"], dropna=False).agg(agg_map).reset_index()
    grouped = grouped.rename(columns={"_games_played": "games_played"})

    if "character" in df.columns:
        def _unique_join(series: pd.Series) -> Optional[str]:
            values = [str(x) for x in series if pd.notna(x) and str(x).strip()]
            if not values:
                return None
            seen = []
            for v in values:
                if v not in seen:
                    seen.append(v)
            return ", ".join(seen)

        chars = (
            df.groupby(["player_name","team_name","team_num"], dropna=False)["character"]
            .agg(_unique_join)
            .reset_index()
        )
        grouped = grouped.merge(chars, on=["player_name","team_name","team_num"], how="left")
        grouped = grouped.rename(columns={"character": "characters"})
    else:
        grouped["characters"] = None

    grouped["games_played"] = grouped["games_played"].fillna(0).astype(int)

    for c in num_cols:
        grouped[c] = grouped[c].fillna(0).round(0).astype(int)

    grouped["accuracy"] = (grouped["hits"] / grouped["shots"]).where(grouped["shots"]>0, 0) * 100.0
    grouped["headshots_accuracy"] = (grouped["headshots"] / grouped["hits"]).where(grouped["hits"]>0, 0) * 100.0
    grouped["accuracy"] = grouped["accuracy"].round(2)
    grouped["headshots_accuracy"] = grouped["headshots_accuracy"].round(2)

    grouped = grouped.rename(columns={"placement": "placement_avg"})
    grouped["placement_avg"] = grouped["placement_avg"].round(2)

    def _to_int_or_none(x):
        try:
            return int(x)
        except Exception:
            return None

    grouped["team_num"] = grouped["team_num"].apply(_to_int_or_none)
    grouped["_team_num_sort"] = grouped["team_num"].apply(
        lambda x: x if isinstance(x, int) else 10**9
    )
    grouped = grouped.sort_values(
        by=["_team_num_sort", "team_name", "player_name"],
        na_position="last"
    ).drop(columns="_team_num_sort").reset_index(drop=True)

    out_cols = [
        "team_name","team_num","player_name","characters","games_played",
        "kills","assists","damage","shots","hits","accuracy",
        "headshots","headshots_accuracy","survival_time","placement_avg"
    ]

    for c in out_cols:
        if c not in grouped.columns:
            grouped[c] = None

    return grouped[out_cols]

# ===== Commands =====
@BOT.tree.command(name="escl_version", description="Botのバージョン表示（動いているコード確認用）")
async def escl_version(inter: discord.Interaction):
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
    title = f"{_safe_name(scrim_name)}_{_safe_name(group or '')}".rstrip("_")
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
    team_totals = _aggregate_team_totals(df_all)

    mem = io.BytesIO()
    with pd.ExcelWriter(mem, engine="xlsxwriter") as writer:
        # 各試合シート（RAW）
        for g in sorted(set(df_all["game"].dropna().astype(int))):
            dfg = df_all[df_all["game"] == g]
            dfg.to_excel(writer, sheet_name=f"GAME{g}", index=False)

        # プレイヤー合計（6試合分）
        player_totals = _aggregate_player_totals(df_all)
        player_totals.to_excel(writer, sheet_name="ALL_GAMES", index=False)

        # 新要件：チーム合計
        team_totals.to_excel(writer, sheet_name="TEAM_TOTALS", index=False)

    mem.seek(0)

    scrim_uuid, group_uuid = parse_scrim_group_from_url(parent_url)
    scrim_name = get_scrim_name(scrim_uuid, group_uuid) or "ESCL_Scrim"
    title = f"{_safe_name(scrim_name)}_{_safe_name(group or '')}".rstrip("_")
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
