from datetime import datetime, timezone

from app.logic.social import decide_duel_winner, duel_ends_at

NY = "America/New_York"


def test_duel_ends_at_next_monday_reset_hour():
    # Week of Mon 2026-06-08; reset hour 4 → ends Mon 2026-06-15 04:00 EDT
    # = 08:00 UTC (EDT is UTC-4).
    end = duel_ends_at("2026-06-08", NY, 4)
    assert end == datetime(2026, 6, 15, 8, 0, tzinfo=timezone.utc)


def test_duel_ends_at_handles_dst_fall_back():
    # Week of Mon 2026-10-26: DST ends Sun 2026-11-01 (EDT→EST).
    # End = Mon 2026-11-02 04:00 EST = 09:00 UTC (EST is UTC-5).
    end = duel_ends_at("2026-10-26", NY, 4)
    assert end == datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)


def test_decide_duel_winner():
    assert decide_duel_winner(120, 80) == "challenger"
    assert decide_duel_winner(80, 120) == "opponent"
    assert decide_duel_winner(100, 100) is None  # draw
