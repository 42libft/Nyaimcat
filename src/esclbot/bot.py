from __future__ import annotations

import asyncio
import io
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, cast

import discord
from discord import AllowedMentions, app_commands
from discord.abc import Messageable
from discord.ext import commands
from dotenv import load_dotenv
import pandas as pd
from zoneinfo import ZoneInfo

from .api_scraper import (
    collect_csv_from_parent_url,
    get_scrim_name,
    parse_scrim_group_from_url,
)
from .entry_scheduler import EntryJobResult, EntryScheduler, compute_run_at
from .escl_api import ESCLAPIError, ESCLApiClient, ESCLConfigError, ESCLNetworkError
from .team_store import TeamStore, TeamStoreError

__BOT_VERSION__ = "ESCL-Bot v2.0-entry"

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

def _safe_name(s: str) -> str:
    return "".join(c for c in s if c not in r'\/:*?"<>|').strip()

def _df_to_discord_file(df: pd.DataFrame, filename: str) -> discord.File:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    data = io.BytesIO(buf.getvalue().encode("utf-8"))
    return discord.File(data, filename=filename)


def _extract_active_scrims(payload: Optional[Dict[str, Any]]) -> Sequence[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []

    def _from_candidates(obj: Dict[str, Any]) -> Sequence[Dict[str, Any]]:
        for key in (
            "scrims",
            "scrimList",
            "scrim_list",
            "items",
            "data",
            "result",
            "payload",
        ):
            if key not in obj:
                continue
            value = obj[key]
            if isinstance(value, list):
                return [entry for entry in value if isinstance(entry, dict)]
            if isinstance(value, dict):
                nested = _from_candidates(value)
                if nested:
                    return nested
        return []

    return _from_candidates(payload)


def _render_active_scrims(payload: Optional[Dict[str, Any]]) -> str:
    scrims = list(_extract_active_scrims(payload))
    if not scrims:
        return "アクティブなスクリム情報が取得できませんでした。"

    lines = []
    for idx, item in enumerate(scrims[:10], start=1):
        scrim_id = item.get("scrimId") or item.get("id") or item.get("scrim_id")
        title = item.get("title") or item.get("name") or item.get("scrimName")
        entry_start = item.get("entryStartAt") or item.get("entryStart") or item.get("entry_start_at")
        start_at = item.get("startAt") or item.get("start") or item.get("start_at")
        segments = [
            f"{idx}. scrim_id={scrim_id or '不明'}",
            title or "タイトル不明",
        ]
        if entry_start:
            segments.append(f"受付開始: {entry_start}")
        if start_at:
            segments.append(f"開催: {start_at}")
        lines.append(" | ".join(str(seg) for seg in segments if seg))

    if len(scrims) > 10:
        lines.append(f"...ほか {len(scrims) - 10} 件")

    return "\n".join(lines)


def _format_entry_result(result: EntryJobResult) -> str:
    icon = "✅" if result.ok else "❌"
    status = f"status={result.status_code}" if result.status_code is not None else "status=不明"
    attempt = f"試行回数: {result.attempts}"
    lines = [f"{icon} {result.summary}", f"- {status}", f"- {attempt}"]
    if result.detail:
        lines.append(f"- 詳細: {result.detail}")
    return "\n".join(lines)


def _format_timedelta(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return "0秒"
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts = []
    if hours:
        parts.append(f"{hours}時間")
    if minutes:
        parts.append(f"{minutes}分")
    if seconds or not parts:
        parts.append(f"{seconds}秒")
    return " ".join(parts)

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
@BOT.tree.command(name="version", description="Botのバージョン表示（動いているコード確認用）")
async def version(inter: discord.Interaction):
    await inter.response.send_message(f"{__BOT_VERSION__}", ephemeral=True)


@BOT.tree.command(name="set-team", description="ESCL の teamId を登録します。")
@app_commands.describe(team_id="ESCL の teamId を入力してください。")
async def set_team(inter: discord.Interaction, team_id: int):
    if team_id <= 0:
        await inter.response.send_message("team_id は正の整数で指定してください。", ephemeral=True)
        return

    bot = cast(ESCLDiscordBot, inter.client)
    try:
        await bot.team_store.set_team_id(inter.user.id, team_id)
    except TeamStoreError as exc:
        logger.error("team_id の保存に失敗しました: %s", exc)
        await inter.response.send_message(
            "teamId の保存に失敗しました。ファイル権限を確認して後ほど再試行してください。",
            ephemeral=True,
        )
        return

    await inter.response.send_message(f"teamId={team_id} を登録しました。", ephemeral=True)


@BOT.tree.command(name="list-active", description="受付中または近日の ESCL スクリム一覧を表示します。")
async def list_active(inter: discord.Interaction):
    await inter.response.defer(thinking=True, ephemeral=True)
    bot = cast(ESCLDiscordBot, inter.client)
    try:
        response = await bot.escl_client.list_active_scrims()
    except ESCLConfigError:
        await inter.followup.send("ESCL_JWT が設定されていません。.env を確認してください。", ephemeral=True)
        return
    except ESCLNetworkError as exc:
        await inter.followup.send(f"ESCL API への接続に失敗しました: {exc}", ephemeral=True)
        return
    except ESCLAPIError as exc:
        await inter.followup.send(f"ESCL API 呼び出しで想定外のエラーが発生しました: {exc}", ephemeral=True)
        return

    if response.status_code != 200:
        await inter.followup.send(
            f"ListActiveScrim が status={response.status_code} で失敗しました。\n{response.text}",
            ephemeral=True,
        )
        return

    message = _render_active_scrims(response.payload)
    await inter.followup.send(message, ephemeral=True)


@BOT.tree.command(name="entry", description="ESCL 応募を前日0:00(JST)に自動送信します。")
@app_commands.describe(
    event_date="スクリム開催日 (YYYY-MM-DD)",
    scrim_id="ESCL の scrimId",
    team_id="省略時は登録済み teamId を使用します",
)
async def entry(
    inter: discord.Interaction,
    event_date: str,
    scrim_id: int,
    team_id: Optional[int] = None,
) -> None:
    bot = cast(ESCLDiscordBot, inter.client)

    try:
        target_date = date.fromisoformat(event_date)
    except ValueError:
        await inter.response.send_message("日付は `YYYY-MM-DD` 形式で指定してください。", ephemeral=True)
        return

    if scrim_id <= 0:
        await inter.response.send_message("scrim_id は正の整数で指定してください。", ephemeral=True)
        return

    if team_id is not None and team_id <= 0:
        await inter.response.send_message("team_id は正の整数で指定してください。", ephemeral=True)
        return

    if not os.getenv("ESCL_JWT"):
        await inter.response.send_message("ESCL_JWT が設定されていません。.env を確認してください。", ephemeral=True)
        return

    now_jst = datetime.now(bot.jst)

    try:
        if team_id is None:
            resolved_team_id, from_store = await bot.team_store.resolve_team_id(inter.user.id)
            if resolved_team_id is None:
                await inter.response.send_message(
                    "teamId が未登録です。`/set-team` で登録するか、`team_id` 引数を指定してください。",
                    ephemeral=True,
                )
                return
            team_id = resolved_team_id
            team_source = "ユーザー登録値" if from_store else "デフォルト設定"
        else:
            team_source = "コマンド指定"
    except TeamStoreError as exc:
        logger.error("teamId の参照に失敗しました: %s", exc)
        await inter.response.send_message(
            "teamId の参照に失敗しました。後ほど再試行してください。",
            ephemeral=True,
        )
        return

    run_at = compute_run_at(target_date, bot.jst)
    run_at_display = run_at.strftime("%Y-%m-%d %H:%M:%S %Z")
    immediate = run_at <= now_jst
    remaining = run_at - now_jst

    header_lines = [
        "📝 応募予約を登録します。",
        f"- 開催日: {target_date.isoformat()} (応募送信 {run_at_display})",
        f"- scrim_id: {scrim_id}",
        f"- team_id: {team_id} ({team_source})",
    ]
    if not immediate:
        header_lines.append(f"- 実行まで残り: {_format_timedelta(remaining)}")
    else:
        header_lines.append("- ⚠️ 実行時刻を過ぎているため即時送信を試みます。")

    await inter.response.send_message(
        "\n".join(header_lines),
        allowed_mentions=bot.allowed_mentions,
    )
    root_message = await inter.original_response()

    progress_target: Optional[Messageable] = None
    fallback_target: Optional[Messageable] = None
    channel = inter.channel
    if isinstance(channel, Messageable):
        fallback_target = channel

    if isinstance(channel, discord.Thread):
        progress_target = channel
    elif isinstance(channel, discord.TextChannel):
        thread_name = _safe_name(f"entry-{target_date.isoformat()}-scrim{scrim_id}")[:100]
        try:
            thread = await root_message.create_thread(
                name=thread_name,
                reason="ESCL entry progress",
            )
            progress_target = thread
        except discord.Forbidden:
            logger.warning("スレッド作成に失敗しました（権限不足）。channel_id=%s", getattr(channel, "id", "unknown"))
        except discord.HTTPException as exc:
            logger.warning("スレッド作成に失敗しました: %s", exc)

    if progress_target is None:
        progress_target = fallback_target

    if isinstance(progress_target, discord.Thread) and progress_target is not fallback_target:
        await progress_target.send("応募ジョブの進捗をこのスレッドで共有します。", allowed_mentions=bot.allowed_mentions)
    elif fallback_target is not None and fallback_target is progress_target and not isinstance(fallback_target, discord.Thread):
        await inter.followup.send(
            "⚠️ スレッドを作成できなかったため、このチャンネルで進捗を共有します。",
            allowed_mentions=bot.allowed_mentions,
        )

    async def progress_log(text: str) -> None:
        targets = []
        if progress_target is not None:
            targets.append(progress_target)
        if fallback_target is not None and fallback_target is not progress_target:
            targets.append(fallback_target)

        for target in targets:
            try:
                await target.send(text, allowed_mentions=bot.allowed_mentions)
                return
            except discord.HTTPException as exc:
                logger.warning("進捗メッセージ送信に失敗しました: %s", exc)

        logger.warning("進捗メッセージを送信できませんでした: %s", text)

    async def handle_result(result: EntryJobResult) -> None:
        await progress_log(_format_entry_result(result))

    try:
        meta = await bot.entry_scheduler.schedule_entry(
            user_id=inter.user.id,
            scrim_id=scrim_id,
            team_id=team_id,
            entry_date=target_date,
            log_hook=progress_log,
            result_hook=handle_result,
            now=now_jst,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("応募ジョブのスケジュールに失敗しました: %s", exc)
        await progress_log("❌ 応募ジョブの登録に失敗しました。再度お試しください。")
        return

    header_lines.append(f"- ジョブID: `{meta.job_id}`")
    await inter.edit_original_response(content="\n".join(header_lines))

    await progress_log(
        f"ジョブID `{meta.job_id}` を登録しました。実行予定: {run_at_display}"
    )

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
