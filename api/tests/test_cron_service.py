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


def _enable_email(monkeypatch, key="re_test"):
    """Sends only happen when a Resend key is configured (emails-off launch)."""
    monkeypatch.setattr(
        cron, "get_settings",
        lambda: SimpleNamespace(resend_api_key=key, app_url="http://localhost:3000"),
    )


def _admin(profiles, users, claim_wins=True):
    admin = MagicMock()
    admin.auth.admin.list_users.side_effect = [users, []]  # one page, then empty

    # Shared email_log mock (same object every table() call) so tests can
    # inspect the claim upsert and the post-send status update.
    email_log = MagicMock()
    # claim upsert: .data non-empty => this run won the claim
    email_log.upsert.return_value.execute.return_value.data = (
        [{"id": "log1"}] if claim_wins else []
    )
    admin.email_log = email_log  # exposed for assertions

    def table(name):
        if name == "email_log":
            return email_log
        t = MagicMock()
        if name == "profile":
            t.select.return_value.execute.return_value.data = profiles
        elif name == "week_plan":
            t.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = None
        return t

    admin.table.side_effect = table
    return admin


def test_bad_timezone_does_not_kill_other_users(monkeypatch):
    _enable_email(monkeypatch)
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
    _enable_email(monkeypatch)
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
    admin.auth.admin.list_users.assert_any_call(page=1, per_page=1000)


def test_failed_send_updates_log_status(monkeypatch):
    # A failed send must still resolve the pending claim row to
    # status='failed' — otherwise email_log lies about what happened.
    def boom(**kw):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(cron, "send_email", boom)
    _enable_email(monkeypatch)
    admin = _admin(profiles=[_profile("u1")], users=[_user("u1", "a@x.com")])
    out = cron.run_reminders(now=NOW, admin=admin)

    assert out["dailySent"] == 0
    assert len(out["errors"]) == 1
    assert "u1" in out["errors"][0] and "smtp down" in out["errors"][0]

    log = admin.email_log
    log.update.assert_called_once_with({"status": "failed", "error": "smtp down"})
    chain = log.update.return_value
    chain.eq.assert_called_once_with("user_id", "u1")
    chain.eq.return_value.eq.assert_called_once_with("quest_date", "2026-06-10")
    chain.eq.return_value.eq.return_value.eq.assert_called_once_with("kind", "daily")
    chain.eq.return_value.eq.return_value.eq.return_value.execute.assert_called_once()


def test_email_target_is_ignored(monkeypatch):
    _enable_email(monkeypatch)
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    p = _profile("u1")
    p["email_target"] = "victim@stranger.com"   # written directly to the DB
    admin = _admin(profiles=[p], users=[_user("u1", "real@x.com")])
    cron.run_reminders(now=NOW, admin=admin)
    assert sent == ["real@x.com"]


def test_no_resend_key_skips_without_claiming(monkeypatch):
    # Launch is intentionally email-less: with no key, due users are counted
    # as skipped — no network call, no email_log claim row — so enabling the
    # key later delivers that day's email normally.
    _enable_email(monkeypatch, key="")
    sent = []
    monkeypatch.setattr(cron, "send_email", lambda **kw: sent.append(kw["to"]))
    admin = _admin(profiles=[_profile("u1")], users=[_user("u1", "a@x.com")])
    out = cron.run_reminders(now=NOW, admin=admin)
    assert sent == []
    assert out["skipped"] >= 1
    assert out["errors"] == []
    admin.email_log.upsert.assert_not_called()
    admin.email_log.update.assert_not_called()
