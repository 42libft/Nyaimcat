from __future__ import annotations

import asyncio
from datetime import date, datetime
from typing import List

import pytest

from src.esclbot.entry_scheduler import (
    EntryJobMetadata,
    EntryJobResult,
    EntryScheduler,
    compute_run_at,
)
from src.esclbot.escl_api import ESCLResponse


class FakeApiClient:
    def __init__(self, responses: List[ESCLResponse]) -> None:
        self._responses = responses
        self.calls = 0

    async def create_application(self, *, scrim_id: int, team_id: int) -> ESCLResponse:
        index = min(self.calls, len(self._responses) - 1)
        self.calls += 1
        return self._responses[index]


class FakeSleeper:
    def __init__(self) -> None:
        self.calls: List[float] = []

    async def sleep(self, delay: float) -> None:
        self.calls.append(delay)


def _meta(now: datetime) -> EntryJobMetadata:
    return EntryJobMetadata(
        job_id="job",
        scrim_id=123,
        team_id=456,
        entry_date=now.date(),
        run_at=now,
        created_by=1,
        created_at=now,
    )


def _now_jst() -> datetime:
    tz = compute_run_at(date.today()).tzinfo
    assert tz is not None
    return datetime.now(tz)


def test_compute_run_at_returns_previous_midnight() -> None:
    run_at = compute_run_at(date(2025, 1, 2))
    assert run_at.date() == date(2025, 1, 1)
    assert run_at.hour == 0
    assert run_at.minute == 0
    assert run_at.tzinfo is not None


def test_execute_attempts_success_on_first_try() -> None:
    now = _now_jst()
    client = FakeApiClient([ESCLResponse(status_code=200, payload={"message": "ok"}, text="ok")])
    sleeper = FakeSleeper()
    scheduler = EntryScheduler(client, sleep_coro=sleeper.sleep)

    logs: List[str] = []

    async def log_hook(message: str) -> None:
        logs.append(message)

    async def run() -> EntryJobResult:
        return await scheduler._execute_attempts(_meta(now), log_hook=log_hook)  # noqa: SLF001

    result = asyncio.run(run())

    assert result.ok is True
    assert result.status_code == 200
    assert result.attempts == 1
    assert any("成功" in log for log in logs)
    assert sleeper.calls == []


def test_execute_attempts_retries_on_422() -> None:
    now = _now_jst()
    client = FakeApiClient(
        [
            ESCLResponse(status_code=422, payload={"message": "not open"}, text="not open"),
            ESCLResponse(status_code=200, payload=None, text="ok"),
        ]
    )
    sleeper = FakeSleeper()
    scheduler = EntryScheduler(client, sleep_coro=sleeper.sleep)

    logs: List[str] = []

    async def log_hook(message: str) -> None:
        logs.append(message)

    async def run() -> EntryJobResult:
        return await scheduler._execute_attempts(_meta(now), log_hook=log_hook)  # noqa: SLF001

    result = asyncio.run(run())

    assert result.ok is True
    assert result.attempts == 2
    assert any("受付開始前" in log for log in logs)
    assert sleeper.calls == [0.5]


def test_execute_attempts_handles_429_backoff() -> None:
    now = _now_jst()
    client = FakeApiClient(
        [
            ESCLResponse(status_code=429, payload={"message": "rate"}, text="rate"),
            ESCLResponse(status_code=200, payload=None, text="ok"),
        ]
    )
    sleeper = FakeSleeper()
    scheduler = EntryScheduler(client, sleep_coro=sleeper.sleep)

    logs: List[str] = []

    async def log_hook(message: str) -> None:
        logs.append(message)

    async def run() -> EntryJobResult:
        return await scheduler._execute_attempts(_meta(now), log_hook=log_hook)  # noqa: SLF001

    result = asyncio.run(run())

    assert result.ok is True
    assert result.attempts == 2
    assert any("レート制限" in log for log in logs)
    assert sleeper.calls == [1.0, 0.5]
