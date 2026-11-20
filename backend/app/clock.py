from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from .config import TIMEZONE_NAME


def now() -> dt.datetime:
    if TIMEZONE_NAME == "local":
        return dt.datetime.now()
    return dt.datetime.now(ZoneInfo(TIMEZONE_NAME)).replace(tzinfo=None)


def today() -> dt.date:
    return now().date()
