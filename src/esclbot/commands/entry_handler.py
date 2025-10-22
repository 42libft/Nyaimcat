"""Refined handler for the `/entry` command to reduce coupling in bot.py."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING, List, Optional

import discord
from discord.abc import Messageable

from ..entry_scheduler import EntryJobResult, compute_run_at
from ..reports import safe_filename_component
from ..team_store import TeamStoreError

if TYPE_CHECKING:
    from ..bot import ESCLDiscordBot


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EntryParameters:
    event_date: date
    scrim_id: int
    team_id: int
    team_source: str
    now: datetime
    dispatch_time: Optional[time]


class EntryCommandError(Exception):
    def __init__(self, message: str, *, ephemeral: bool = True) -> None:
        super().__init__(message)
        self.message = message
        self.ephemeral = ephemeral


class EntryCommandHandler:
    def __init__(self, bot: "ESCLDiscordBot", interaction: discord.Interaction) -> None:
        self.bot = bot
        self.interaction = interaction
        self._header_lines: List[str] = []
        self._progress_targets: List[Messageable] = []
        self._root_message: Optional[discord.Message] = None

    async def execute(
        self,
        event_date: str,
        scrim_id: int,
        team_id: Optional[int],
        dispatch_at: Optional[str],
    ) -> None:
        try:
            params = await self._validate_and_resolve(event_date, scrim_id, team_id, dispatch_at)
        except EntryCommandError as error:
            await self.interaction.response.send_message(error.message, ephemeral=error.ephemeral)
            return

        run_at = compute_run_at(
            params.event_date,
            self.bot.jst,
            dispatch_time=params.dispatch_time,
        )
        run_at_display = run_at.strftime("%Y-%m-%d %H:%M:%S %Z")
        remaining = run_at - params.now
        immediate = run_at <= params.now

        header_lines = [
            "📝 応募予約を登録します。",
            f"- 開催日: {params.event_date.isoformat()} (応募送信 {run_at_display})",
            f"- scrim_id: {params.scrim_id}",
            f"- team_id: {params.team_id} ({params.team_source})",
        ]
        if immediate:
            header_lines.append("- ⚠️ 実行時刻を過ぎているため即時送信を試みます。")
        else:
            header_lines.append(f"- 実行まで残り: {format_timedelta(remaining)}")

        self._header_lines = header_lines
        self._header_lines.append("- モード: 予約送信 (最大3回リトライ)")

        await self.interaction.response.send_message(
            "\n".join(header_lines),
            allowed_mentions=self.bot.allowed_mentions,
        )

        self._root_message = await self.interaction.original_response()
        await self._prepare_progress_targets(params.event_date, params.scrim_id)

        try:
            metadata = await self.bot.entry_scheduler.schedule_entry(
                user_id=self.interaction.user.id,
                scrim_id=params.scrim_id,
                team_id=params.team_id,
                entry_date=params.event_date,
                dispatch_time=params.dispatch_time,
                log_hook=self.send_progress,
                result_hook=self._handle_result,
                now=params.now,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("応募ジョブのスケジュールに失敗しました: %s", exc)
            await self.send_progress("❌ 応募ジョブの登録に失敗しました。再度お試しください。")
            return

        self._header_lines.append(f"- ジョブID: `{metadata.job_id}`")
        await self.interaction.edit_original_response(content="\n".join(self._header_lines))

        await self.send_progress(f"ジョブID `{metadata.job_id}` を登録しました。実行予定: {run_at_display}")

    async def execute_immediate(
        self,
        event_date: str,
        scrim_id: int,
        team_id: Optional[int],
    ) -> None:
        try:
            params = await self._validate_and_resolve(event_date, scrim_id, team_id, dispatch_at=None)
        except EntryCommandError as error:
            await self.interaction.response.send_message(error.message, ephemeral=error.ephemeral)
            return

        header_lines = [
            "📝 応募を即時送信します。",
            f"- 開催日: {params.event_date.isoformat()}",
            f"- scrim_id: {params.scrim_id}",
            f"- team_id: {params.team_id} ({params.team_source})",
            "- モード: 即時送信 (リトライなし)",
        ]
        self._header_lines = header_lines

        await self.interaction.response.send_message(
            "\n".join(header_lines),
            allowed_mentions=self.bot.allowed_mentions,
        )

        self._root_message = await self.interaction.original_response()
        await self._prepare_progress_targets(params.event_date, params.scrim_id)

        try:
            result = await self.bot.entry_scheduler.run_entry_immediately(
                user_id=self.interaction.user.id,
                scrim_id=params.scrim_id,
                team_id=params.team_id,
                entry_date=params.event_date,
                log_hook=self.send_progress,
                result_hook=self._handle_result,
                now=params.now,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("応募の即時送信に失敗しました: %s", exc)
            await self.send_progress("❌ 応募の送信に失敗しました。再度お試しください。")
            return

        status_text = "成功" if result.ok else "失敗"
        status_code = result.status_code if result.status_code is not None else "不明"
        self._header_lines.append(f"- 結果: {status_text} (status={status_code})")
        await self.interaction.edit_original_response(content="\n".join(self._header_lines))

    async def send_progress(self, text: str) -> None:
        for target in self._progress_targets:
            try:
                await target.send(text, allowed_mentions=self.bot.allowed_mentions)
                return
            except discord.HTTPException as exc:
                logger.warning("進捗メッセージ送信に失敗しました: %s", exc)

        logger.warning("進捗メッセージを送信できませんでした: %s", text)

    async def _handle_result(self, result: EntryJobResult) -> None:
        await self.send_progress(format_entry_result(result))

    async def _validate_and_resolve(
        self,
        event_date: str,
        scrim_id: int,
        team_id: Optional[int],
        dispatch_at: Optional[str],
    ) -> EntryParameters:
        try:
            parsed_date = date.fromisoformat(event_date)
        except ValueError as exc:
            raise EntryCommandError("日付は `YYYY-MM-DD` 形式で指定してください。") from exc

        if scrim_id <= 0:
            raise EntryCommandError("scrim_id は正の整数で指定してください。")

        if team_id is not None and team_id <= 0:
            raise EntryCommandError("team_id は正の整数で指定してください。")

        if not os.getenv("ESCL_JWT"):
            raise EntryCommandError("ESCL_JWT が設定されていません。.env を確認してください。")

        now = datetime.now(self.bot.jst)

        dispatch_time = self._parse_dispatch_time(dispatch_at)

        if team_id is not None:
            resolved_team_id = team_id
            team_source = "コマンド指定"
        else:
            try:
                resolved_team_id, from_store = await self.bot.team_store.resolve_team_id(
                    self.interaction.user.id
                )
            except TeamStoreError as exc:
                logger.error("teamId の参照に失敗しました: %s", exc)
                raise EntryCommandError(
                    "teamId の参照に失敗しました。後ほど再試行してください。"
                ) from exc

            if resolved_team_id is None:
                raise EntryCommandError(
                    "teamId が未登録です。`/set-team` で登録するか、`team_id` 引数を指定してください。"
                )

            team_source = "ユーザー登録値" if from_store else "デフォルト設定"

        return EntryParameters(
            event_date=parsed_date,
            scrim_id=scrim_id,
            team_id=resolved_team_id,
            team_source=team_source,
            now=now,
            dispatch_time=dispatch_time,
        )

    def _parse_dispatch_time(self, dispatch_at: Optional[str]) -> Optional[time]:
        if dispatch_at is None:
            return None
        text = dispatch_at.strip()
        if not text:
            return None
        segments = text.split(":")
        if len(segments) != 2:
            raise EntryCommandError("応募時刻は `HH:MM` 形式で指定してください。")
        try:
            hour = int(segments[0], 10)
            minute = int(segments[1], 10)
        except ValueError as exc:
            raise EntryCommandError("応募時刻は `HH:MM` 形式で指定してください。") from exc
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise EntryCommandError("応募時刻は 00:00〜23:59 の範囲で指定してください。")
        return time(hour=hour, minute=minute, tzinfo=self.bot.jst)

    async def _prepare_progress_targets(self, event_date: date, scrim_id: int) -> None:
        channel = self.interaction.channel
        fallback_target: Optional[Messageable] = channel if isinstance(channel, Messageable) else None
        progress_target: Optional[Messageable] = None

        if isinstance(channel, discord.Thread):
            progress_target = channel
        elif isinstance(channel, discord.TextChannel) and self._root_message is not None:
            base_name = f"entry-{event_date.isoformat()}-scrim{scrim_id}"
            thread_name = safe_filename_component(base_name)[:100] or "entry-progress"
            try:
                thread = await self._root_message.create_thread(
                    name=thread_name,
                    reason="ESCL entry progress",
                )
                progress_target = thread
            except discord.Forbidden:
                logger.warning(
                    "スレッド作成に失敗しました（権限不足）。channel_id=%s",
                    getattr(channel, "id", "unknown"),
                )
            except discord.HTTPException as exc:
                logger.warning("スレッド作成に失敗しました: %s", exc)

        targets: List[Messageable] = []
        if progress_target is not None:
            targets.append(progress_target)
        if fallback_target is not None and fallback_target not in targets:
            targets.append(fallback_target)

        self._progress_targets = targets

        if isinstance(progress_target, discord.Thread) and progress_target is not fallback_target:
            await progress_target.send(
                "応募ジョブの進捗をこのスレッドで共有します。",
                allowed_mentions=self.bot.allowed_mentions,
            )
        elif (
            fallback_target is not None
            and fallback_target is progress_target
            and not isinstance(fallback_target, discord.Thread)
        ):
            await self.interaction.followup.send(
                "⚠️ スレッドを作成できなかったため、このチャンネルで進捗を共有します。",
                allowed_mentions=self.bot.allowed_mentions,
            )


def format_entry_result(result: EntryJobResult) -> str:
    icon = "✅" if result.ok else "❌"
    status = f"status={result.status_code}" if result.status_code is not None else "status=不明"
    attempt = f"試行回数: {result.attempts}"
    lines = [f"{icon} {result.summary}", f"- {status}", f"- {attempt}"]
    if result.detail:
        lines.append(f"- 詳細: {result.detail}")
    return "\n".join(lines)


def format_timedelta(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return "0秒"
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts: list[str] = []
    if hours:
        parts.append(f"{hours}時間")
    if minutes:
        parts.append(f"{minutes}分")
    if seconds or not parts:
        parts.append(f"{seconds}秒")
    return " ".join(parts)
