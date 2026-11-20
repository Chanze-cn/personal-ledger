"""轻量定时调度：每日固定时间日切片 + 周期补偿巡检。"""

from __future__ import annotations

import asyncio
import datetime as dt
import traceback

from ..config import CATCHUP_INTERVAL_MINUTES, DAILY_JOB_HOUR, DAILY_JOB_MINUTE
from ..clock import now as local_now
from .jobs import schedule_catchup, schedule_daily_rollup


def seconds_until(hour: int, minute: int, now: dt.datetime | None = None) -> float:
    now = now or local_now()
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += dt.timedelta(days=1)
    return max(1.0, (target - now).total_seconds())


class RollupScheduler:
    def __init__(self) -> None:
        self._daily_task: asyncio.Task | None = None
        self._catchup_task: asyncio.Task | None = None

    def start(self) -> None:
        if self._daily_task is None:
            self._daily_task = asyncio.create_task(self._daily_loop())
        if self._catchup_task is None:
            self._catchup_task = asyncio.create_task(self._catchup_loop())

    async def stop(self) -> None:
        for task in (self._daily_task, self._catchup_task):
            if task is None:
                continue
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._daily_task = None
        self._catchup_task = None

    async def _daily_loop(self) -> None:
        while True:
            try:
                delay = seconds_until(DAILY_JOB_HOUR, DAILY_JOB_MINUTE)
                await asyncio.sleep(delay)
                await asyncio.to_thread(schedule_daily_rollup)
                # Generate due recurring transactions at the same daily
                # boundary. The occurrence table makes retries idempotent.
                from .recurring import generate_due_for_all_users

                await asyncio.to_thread(generate_due_for_all_users)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                traceback.print_exc()
                await asyncio.sleep(30)

    async def _catchup_loop(self) -> None:
        interval = max(1, CATCHUP_INTERVAL_MINUTES) * 60
        while True:
            try:
                await asyncio.sleep(interval)
                await asyncio.to_thread(schedule_catchup)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                traceback.print_exc()
                await asyncio.sleep(30)


scheduler = RollupScheduler()
