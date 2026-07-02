"""run_reminders orchestration: fault isolation, pagination, claim-then-send.

Uses MagicMock for the admin client — we assert orchestration behaviour
(what got called, what the summary says), not PostgREST internals.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.cron_service as cron

# 11:00 UTC = 07:00 America/New_York (EDT) — send_hour 7 => daily due.
NOW = datetime(2026, 6, 10, 11, 0, tzinfo=timezone.utc)


def _profile(uid, tz="America/New_York"):
    return {
        "user_id": uid, "username": "hunter_" + uid, "timezone": tz,
        "email_send_hour_local": 7, "reset_hour_local": 4,
        "email_enabled": True, "email_target": None,
    }


def _user(uid, email):
    return SimpleNamespace(id=uid, email=email)


def _admin(profiles, users, claim_wins=True):
    admin = MagicMock()
    admin.auth.admin.list_users.side_effect = [users, []]  # one page, then empty

    def table(name):
        t = MagicMock()
        if name == "profile":
            t.select.return_value.execute.return_value.data = profiles
        elif name == "email_log":
            # claim upsert: .data non-empty => this run won the claim
            t.upsert.return_value.execute.return_value.data = (
                [{"id": "log1"}] if claim_wins else []
            )
        elif name == "week_plan":
            t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
        return t

    admin.table.side_effect = table
    return admin


def test_bad_timezone_does_not_kill_other_users(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    admin = _admin(
        profiles=[_profile("u1", tz="Not/AZone"), _profile("u2")],
        users=[_user("u1", "a@x.com"), _user("u2", "b@x.com")],
    )
    out = cron.run_reminders(now=NOW, admin=admin)
    assert sent == ["b@x.com"]          # u2 still got their email
    assert len(out["errors"]) == 1      # u1 recorded, not raised
    assert "u1" in out["errors"][0]


def test_lost_claim_skips_send(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    admin = _admin(
        profiles=[_profile("u1")], users=[_user("u1", "a@x.com")], claim_wins=False,
    )
    out = cron.run_reminders(now=NOW, admin=admin)
    assert sent == []
    assert out["skipped"] >= 1


def test_email_map_paginates(monkeypatch):
    # _email_map requests 1000/page and stops on a short page — a full first
    # page must trigger a second request (the old code silently capped at 50).
    admin = MagicMock()
    page1 = [_user(f"u{i}", f"{i}@x.com") for i in range(1000)]
    page2 = [_user("u1000", "1000@x.com")]
    admin.auth.admin.list_users.side_effect = [page1, page2, []]
    out = cron._email_map(admin)
    assert len(out) == 1001
    assert admin.auth.admin.list_users.call_count == 2


def test_email_target_is_ignored(monkeypatch):
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    p = _profile("u1")
    p["email_target"] = "victim@stranger.com"   # written directly to the DB
    admin = _admin(profiles=[p], users=[_user("u1", "real@x.com")])
    cron.run_reminders(now=NOW, admin=admin)
    assert sent == ["real@x.com"]
