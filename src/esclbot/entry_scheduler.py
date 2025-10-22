from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Awaitable, Callable, Dict, Optional
from zoneinfo import ZoneInfo

from .escl_api import (
    ESCLAPIError,
    ESCLApiClient,
    ESCLAuthError,
    ESCLNetworkError,
)

LogHook = Callable[[str], Awaitable[None]]
ResultHook = Callable[["EntryJobResult"], Awaitable[None]]

JST = ZoneInfo("Asia/Tokyo")

__all__ = [
    "EntryJobMetadata",
    "EntryJobResult",
    "EntryScheduler",
    "compute_run_at",
]


@dataclass(slots=True)
class EntryJobMetadata:
    job_id: str
    scrim_id: int
    team_id: int
    entry_date: date
    run_at: datetime
    created_by: int
    created_at: datetime


@dataclass(slots=True)
class EntryJobResult:
    ok: bool
    status_code: Optional[int]
    attempts: int
    summary: str
    detail: Optional[str] = None
    payload: Optional[Dict[str, object]] = None


class EntryScheduler:
    """
    ESCL 応募スケジューラ。

    - run_at（前日 0:00 JST）まで待機し、0.5 秒間隔 × 最大3回で応募を試行
    - ログは log_hook 経由で逐次通知
    """

    def __init__(
        self,
        api_client: ESCLApiClient,
        *,
        timezone: ZoneInfo = JST,
        max_attempts: int = 3,
        retry_interval: float = 0.5,
        retry_backoff_after_429: float = 1.0,
        sleep_coro: Optional[Callable[[float], Awaitable[None]]] = None,
    ) -> None:
        self._api_client = api_client
        self._tz = timezone
        self._max_attempts = max_attempts
        self._retry_interval = retry_interval
        self._backoff_after_429 = retry_backoff_after_429
        self._sleep = sleep_coro or asyncio.sleep
        self._jobs: Dict[str, asyncio.Task[None]] = {}
        self._metadata: Dict[str, EntryJobMetadata] = {}
        self._lock = asyncio.Lock()

    async def shutdown(self) -> None:
        async with self._lock:
            tasks = list(self._jobs.values())
            self._jobs.clear()
            self._metadata.clear()

        for task in tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def schedule_entry(
        self,
        *,
        user_id: int,
        scrim_id: int,
        team_id: int,
        entry_date: date,
        dispatch_time: Optional[time] = None,
        log_hook: LogHook,
        result_hook: Optional[ResultHook] = None,
        job_id: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> EntryJobMetadata:
        run_at = compute_run_at(entry_date, self._tz, dispatch_time=dispatch_time)
        job_id = job_id or secrets.token_hex(8)
        now_dt = now or datetime.now(self._tz)
        meta = EntryJobMetadata(
            job_id=job_id,
            scrim_id=scrim_id,
            team_id=team_id,
            entry_date=entry_date,
            run_at=run_at,
            created_by=user_id,
            created_at=now_dt,
        )

        task = asyncio.create_task(
            self._job_runner(meta, log_hook=log_hook, result_hook=result_hook, now=now_dt),
            name=f"entry-job-{job_id}",
        )

        async with self._lock:
            self._jobs[job_id] = task
            self._metadata[job_id] = meta

        task.add_done_callback(lambda t, job_id=job_id: asyncio.create_task(self._cleanup(job_id, t)))
        return meta

    async def get_metadata(self, job_id: str) -> Optional[EntryJobMetadata]:
        async with self._lock:
            return self._metadata.get(job_id)

    async def _cleanup(self, job_id: str, task: asyncio.Task[None]) -> None:
        try:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        finally:
            async with self._lock:
                self._jobs.pop(job_id, None)
                self._metadata.pop(job_id, None)

    async def _job_runner(
        self,
        meta: EntryJobMetadata,
        *,
        log_hook: LogHook,
        result_hook: Optional[ResultHook],
        now: datetime,
    ) -> None:
        try:
            await self._await_until(meta.run_at, now=now, log_hook=log_hook)
            attempts = self._max_attempts
            await log_hook(
                f"応募送信を開始します: scrim_id={meta.scrim_id}, team_id={meta.team_id}, 最大試行 {attempts} 回"
            )
            result = await self._execute_attempts(meta, log_hook=log_hook, max_attempts=attempts)
            if result_hook:
                await result_hook(result)
        except asyncio.CancelledError:
            await log_hook("応募ジョブがキャンセルされました。")
            raise
        except Exception as exc:
            await log_hook(f"応募ジョブで想定外のエラーが発生しました: {exc}")
            if result_hook:
                failure = EntryJobResult(
                    ok=False,
                    status_code=None,
                    attempts=0,
                    summary="内部エラーが発生しました。",
                    detail=str(exc),
                )
                await result_hook(failure)

    async def _await_until(self, target: datetime, *, now: datetime, log_hook: LogHook) -> None:
        now_dt = now
        if now_dt.tzinfo is None:
            now_dt = now_dt.replace(tzinfo=self._tz)
        delay = (target - now_dt).total_seconds()
        if delay <= 0:
            await log_hook("予定時刻を過ぎているため即時送信を試みます。")
            return
        hours = int(delay // 3600)
        minutes = int((delay % 3600) // 60)
        seconds = int(delay % 60)
        await log_hook(f"応募実行まで {hours}時間 {minutes}分 {seconds}秒 待機します。")
        await self._sleep(delay)

    async def _execute_attempts(
        self,
        meta: EntryJobMetadata,
        *,
        log_hook: LogHook,
        max_attempts: Optional[int] = None,
    ) -> EntryJobResult:
        attempts_limit = max_attempts or self._max_attempts
        last_status: Optional[int] = None
        last_detail: Optional[str] = None
        last_payload: Optional[Dict[str, object]] = None

        for attempt in range(1, attempts_limit + 1):
            try:
                response = await self._api_client.create_application(
                    scrim_id=meta.scrim_id, team_id=meta.team_id
                )
            except ESCLAuthError as exc:
                payload = exc.response.payload if isinstance(exc.response.payload, dict) else None
                summary = "ESCL API 認証エラー: JWT を再設定してください。"
                await log_hook(f"[{attempt}/{attempts_limit}] 認証エラーが発生しました。")
                return EntryJobResult(
                    ok=False,
                    status_code=exc.response.status_code,
                    attempts=attempt,
                    summary=summary,
                    detail=_summarize_payload(payload) or exc.response.text,
                    payload=payload,
                )
            except ESCLNetworkError as exc:
                await log_hook(f"[{attempt}/{attempts_limit}] ネットワークエラー: {exc}")
                last_status = None
                last_detail = str(exc)
                last_payload = None
            except ESCLAPIError as exc:
                await log_hook(f"[{attempt}/{attempts_limit}] APIエラー: {exc}")
                last_status = None
                last_detail = str(exc)
                last_payload = None
            else:
                status = response.status_code
                payload = response.payload if isinstance(response.payload, dict) else None
                detail = _summarize_payload(payload)
                last_status = status
                last_detail = detail
                last_payload = payload

                if status in (200, 201):
                    await log_hook(f"[{attempt}/{attempts_limit}] 成功しました (status={status}).")
                    return EntryJobResult(
                        ok=True,
                        status_code=status,
                        attempts=attempt,
                        summary="ESCL への応募が完了しました。",
                        detail=detail,
                        payload=payload,
                    )

                if status == 409:
                    await log_hook(
                        f"[{attempt}/{attempts_limit}] 既に応募済みです (status=409)。"
                    )
                    return EntryJobResult(
                        ok=True,
                        status_code=status,
                        attempts=attempt,
                        summary="既に応募済みでした。",
                        detail=detail,
                        payload=payload,
                    )

                if status == 401:
                    await log_hook(
                        f"[{attempt}/{attempts_limit}] 認証エラー (status=401)。JWT を更新してください。"
                    )
                    return EntryJobResult(
                        ok=False,
                        status_code=status,
                        attempts=attempt,
                        summary="ESCL API の認証に失敗しました。",
                        detail=detail or response.text,
                        payload=payload,
                    )

                if status == 422:
                    await log_hook(
                        f"[{attempt}/{attempts_limit}] 受付開始前または終了後の可能性があります (status=422)。"
                    )
                elif status == 429:
                    await log_hook(
                        f"[{attempt}/{attempts_limit}] レート制限 (status=429)。追加で {self._backoff_after_429:.1f} 秒待機します。"
                    )
                    if attempt != attempts_limit:
                        await self._sleep(self._backoff_after_429)
                else:
                    await log_hook(
                        f"[{attempt}/{attempts_limit}] 応答 status={status}。引き続きリトライします。"
                    )

            if attempt != attempts_limit:
                await self._sleep(self._retry_interval)

        summary = "応募が成功しませんでした。"
        if last_status == 422:
            summary = "受付開始前のまま規定の試行回数を超過しました。"
        elif last_status == 429:
            summary = "レート制限を回避できませんでした。"

        return EntryJobResult(
            ok=False,
            status_code=last_status,
            attempts=attempts_limit,
            summary=summary,
            detail=last_detail,
            payload=last_payload,
        )

    async def run_entry_immediately(
        self,
        *,
        user_id: int,
        scrim_id: int,
        team_id: int,
        entry_date: date,
        log_hook: LogHook,
        result_hook: Optional[ResultHook] = None,
        now: Optional[datetime] = None,
    ) -> EntryJobResult:
        now_dt = now or datetime.now(self._tz)
        meta = EntryJobMetadata(
            job_id=f"now-{secrets.token_hex(6)}",
            scrim_id=scrim_id,
            team_id=team_id,
            entry_date=entry_date,
            run_at=now_dt,
            created_by=user_id,
            created_at=now_dt,
        )
        await log_hook(
            f"応募を即時送信します: scrim_id={meta.scrim_id}, team_id={meta.team_id}, リトライなし"
        )
        result = await self._execute_attempts(meta, log_hook=log_hook, max_attempts=1)
        if result_hook:
            await result_hook(result)
        return result


def compute_run_at(
    entry_date: date,
    tz: ZoneInfo = JST,
    *,
    dispatch_time: Optional[time] = None,
) -> datetime:
    run_date = entry_date - timedelta(days=1)
    send_time = dispatch_time or time(0, 0)
    if send_time.tzinfo is None:
        send_time = send_time.replace(tzinfo=tz)
    run_at = datetime.combine(run_date, send_time)
    return run_at.astimezone(tz)


def _summarize_payload(payload: Optional[Dict[str, object]]) -> Optional[str]:
    if not payload:
        return None
    for key in ("message", "error", "detail", "reason"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    try:
        return json.dumps(payload, ensure_ascii=False)
    except (TypeError, ValueError):
        return None
