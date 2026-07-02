"""Mirror of lib/time.test.ts."""

from datetime import datetime, timezone

from app.logic.time_utils import (
    days_of_week,
    get_current_week_start,
    is_same_local_date,
    local_date_iso,
    local_hour,
    yesterday_local,
)

NY = "America/New_York"


def utc(s: str) -> datetime:
    # Accept the JS "...Z" instants used in the original tests.
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


class TestLocalHour:
    def test_in_tz(self):
        assert local_hour(utc("2026-05-11T17:30:00Z"), NY) == 13  # 13:30 EDT

    def test_utc(self):
        assert local_hour(utc("2026-05-11T17:30:00Z"), "UTC") == 17


class TestLocalDateIso:
    def test_local_date(self):
        assert local_date_iso(utc("2026-05-11T03:00:00Z"), NY) == "2026-05-10"


class TestYesterdayLocal:
    def test_prev_date(self):
        assert yesterday_local("2026-05-11") == "2026-05-10"
        assert yesterday_local("2026-01-01") == "2025-12-31"


class TestIsSameLocalDate:
    def test_same(self):
        a = utc("2026-05-11T10:00:00Z")
        b = utc("2026-05-11T22:00:00Z")
        assert is_same_local_date(a, b, NY) is True

    def test_across_boundary(self):
        a = utc("2026-05-11T03:00:00Z")  # May 10 in NYC
        b = utc("2026-05-11T13:00:00Z")  # May 11 in NYC
        assert is_same_local_date(a, b, NY) is False


class TestGetCurrentWeekStart:
    def test_midweek_past_reset(self):
        d = utc("2026-05-13T18:00:00Z")  # Wed 14:00 EDT
        assert get_current_week_start(d, NY, 4) == "2026-05-11"

    def test_monday_before_reset(self):
        d = utc("2026-05-11T07:00:00Z")  # Mon 03:00 EDT
        assert get_current_week_start(d, NY, 4) == "2026-05-04"

    def test_monday_after_reset(self):
        d = utc("2026-05-11T09:00:00Z")  # Mon 05:00 EDT
        assert get_current_week_start(d, NY, 4) == "2026-05-11"

    def test_sunday_still_last_week(self):
        d = utc("2026-05-17T18:00:00Z")  # Sun 14:00 EDT
        assert get_current_week_start(d, NY, 4) == "2026-05-11"


class TestDaysOfWeek:
    def test_seven_dates(self):
        assert days_of_week("2026-05-11") == [
            "2026-05-11",
            "2026-05-12",
            "2026-05-13",
            "2026-05-14",
            "2026-05-15",
            "2026-05-16",
            "2026-05-17",
        ]
