from datetime import datetime, timezone

from app.logic.email_due import reminder_due


def _utc(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


NY = "America/New_York"


def test_due_at_send_hour():
    # 2026-06-10 11:00 UTC = 07:00 EDT (Wed); send_hour 7 -> daily due, not weekly
    r = reminder_due(now=_utc("2026-06-10T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is True
    assert r.weekly is False
    assert r.local_date == "2026-06-10"
    assert r.week_start == "2026-06-08"


def test_not_due_off_hour():
    r = reminder_due(now=_utc("2026-06-10T15:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is False and r.weekly is False


def test_disabled_never_due():
    r = reminder_due(now=_utc("2026-06-10T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=False)
    assert r.daily is False and r.weekly is False


def test_weekly_on_local_monday():
    # 2026-06-08 11:00 UTC = 07:00 EDT Monday; local_date == week_start -> weekly due
    r = reminder_due(now=_utc("2026-06-08T11:00:00Z"), timezone=NY, send_hour=7, reset_hour=4, email_enabled=True)
    assert r.daily is True and r.weekly is True
    assert r.local_date == "2026-06-08" == r.week_start
