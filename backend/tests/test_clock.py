import datetime as dt

from app import clock


def test_configured_timezone_returns_expected_local_date(monkeypatch):
    class FixedDateTime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 1, 1, 1, 0, tzinfo=tz)

    monkeypatch.setattr(clock.dt, "datetime", FixedDateTime)
    monkeypatch.setattr(clock, "TIMEZONE_NAME", "Asia/Shanghai")
    assert clock.today() == dt.date(2026, 1, 1)
