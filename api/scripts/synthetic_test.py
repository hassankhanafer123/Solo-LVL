"""End-to-end test with 15 synthetic customers against the LIVE Supabase DB.

Creates 15 confirmed test users via the admin API, signs each in for a real
access token, drives a varied end-to-end flow through the running FastAPI
server (default http://localhost:8000), asserts the game logic, then DELETES
all 15 users (FK cascade wipes their data) so the database is left clean.

Run the API first:   uvicorn app.main:app --port 8000
Then:                 python scripts/synthetic_test.py
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from dataclasses import dataclass, field

import httpx
from dotenv import load_dotenv
from supabase import create_client

# Make `app` importable when run from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

API = os.environ.get("API_BASE", "http://localhost:8000")
URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
ANON = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SERVICE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
PASSWORD = "Synthetic#Test123"
N = 15

admin = create_client(URL, SERVICE)


@dataclass
class Result:
    name: str
    checks: list[tuple[str, bool, str]] = field(default_factory=list)

    def check(self, label: str, ok: bool, detail: str = "") -> None:
        self.checks.append((label, bool(ok), detail))

    @property
    def passed(self) -> int:
        return sum(1 for _, ok, _ in self.checks if ok)

    @property
    def failed(self) -> list[tuple[str, bool, str]]:
        return [c for c in self.checks if not c[1]]


class Client:
    """Thin authed HTTP client for one synthetic user."""

    def __init__(self, token: str):
        self.h = {"Authorization": f"Bearer {token}"}

    def get(self, path: str):
        r = httpx.get(f"{API}{path}", headers=self.h, timeout=30)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, body: dict | None = None):
        r = httpx.post(f"{API}{path}", headers=self.h, json=body or {}, timeout=30)
        r.raise_for_status()
        return r.json()


def make_user(i: int) -> tuple[str, str]:
    email = f"sll-synthetic-{uuid.uuid4().hex[:10]}@example.com"
    resp = admin.auth.admin.create_user(
        {"email": email, "password": PASSWORD, "email_confirm": True}
    )
    return resp.user.id, email


def token_for(email: str) -> str:
    anon = create_client(URL, ANON)
    auth = anon.auth.sign_in_with_password({"email": email, "password": PASSWORD})
    return auth.session.access_token


def plan_rows_from_snapshot(snap: dict) -> list[dict]:
    """Convert snapshot daily+weekly quests into PlanRowInput rows (snake_case)."""
    rows = []
    quests = snap["dailyQuests"] + snap["weeklyQuests"]
    for idx, q in enumerate(quests):
        rows.append(
            {
                "id": q["templateId"],
                "name": q["name"],
                "completion_type": q["completionType"],
                "target_value": q["targetValue"],
                "primary_stat": q["stat"],
                "is_required": q["isRequired"],
                "cadence": q["cadence"],
                "sort_order": idx,
            }
        )
    return rows


# ----------------------------- scenarios --------------------------------
def scenario_complete_all(c: Client, r: Result, username: str) -> None:
    snap = c.get("/api/snapshot")
    r.check("fresh: level 1", snap["profile"]["level"] == 1, str(snap["profile"]["level"]))
    r.check("fresh: 6 daily quests", len(snap["dailyQuests"]) == 6, str(len(snap["dailyQuests"])))
    r.check("fresh: 2 weekly quests", len(snap["weeklyQuests"]) == 2, str(len(snap["weeklyQuests"])))
    r.check("fresh: stats 10/10/10",
            snap["profile"]["stats"] == {"INT": 10, "STR": 10, "DIS": 10}, str(snap["profile"]["stats"]))
    r.check("fresh: weeklyTotal 44", snap["weeklyTotal"] == 44, str(snap["weeklyTotal"]))

    u = c.post("/api/username", {"username": username})
    r.check("set username ok", u.get("ok") is True, str(u))

    # Complete all 6 daily quests.
    last = snap
    for q in snap["dailyQuests"]:
        last = c.post(f"/api/quests/{q['instanceId']}/complete")
    all_done = all(q["completed"] for q in last["dailyQuests"])
    r.check("all daily completed", all_done, "")
    # 2 INT + 4 STR dailies => INT +20, STR +40, total +60.
    r.check("INT == 30", last["profile"]["stats"]["INT"] == 30, str(last["profile"]["stats"]["INT"]))
    r.check("STR == 50", last["profile"]["stats"]["STR"] == 50, str(last["profile"]["stats"]["STR"]))
    r.check("totalXp == 60", last["profile"]["totalXp"] == 60, str(last["profile"]["totalXp"]))
    r.check("streak advanced to 1", last["profile"]["streakCurrent"] == 1, str(last["profile"]["streakCurrent"]))
    r.check("weeklyCompleted == 6", last["weeklyCompleted"] == 6, str(last["weeklyCompleted"]))

    # Join the leaderboard and confirm we appear.
    lb = c.post("/api/leaderboard/join")
    r.check("leaderboard opted in", lb["optedIn"] is True, "")
    mine = [e for e in lb["entries"] if e["username"] == username]
    r.check("self on leaderboard", len(mine) == 1, str(len(mine)))


def scenario_partial_then_complete(c: Client, r: Result, username: str) -> None:
    c.post("/api/username", {"username": username})
    snap = c.get("/api/snapshot")
    pushups = next(q for q in snap["dailyQuests"] if q["completionType"] == "count" and q["stat"] == "STR")
    iid = pushups["instanceId"]
    target = pushups["targetValue"]

    half = c.post(f"/api/quests/{iid}/progress", {"actualValue": target // 2})
    pq = next(q for q in half["dailyQuests"] if q["instanceId"] == iid)
    r.check("partial: not completed", pq["completed"] is False, str(pq["completed"]))
    r.check("partial: actual set", pq["actualValue"] == target // 2, str(pq["actualValue"]))
    r.check("partial: totalXp still 0", half["profile"]["totalXp"] == 0, str(half["profile"]["totalXp"]))

    full = c.post(f"/api/quests/{iid}/progress", {"actualValue": target})
    fq = next(q for q in full["dailyQuests"] if q["instanceId"] == iid)
    r.check("reached target auto-completes", fq["completed"] is True, str(fq["completed"]))
    r.check("STR += 10 on complete", full["profile"]["stats"]["STR"] == 20, str(full["profile"]["stats"]["STR"]))
    r.check("totalXp == 10", full["profile"]["totalXp"] == 10, str(full["profile"]["totalXp"]))


def scenario_weekly(c: Client, r: Result, username: str) -> None:
    c.post("/api/username", {"username": username})
    snap = c.get("/api/snapshot")
    last = snap
    for q in snap["weeklyQuests"]:
        last = c.post(f"/api/weekly/{q['instanceId']}/progress", {"actualValue": q["targetValue"]})
    done = all(q["completed"] for q in last["weeklyQuests"])
    r.check("both weekly completed", done, "")
    # 2 weekly DIS quests => DIS +20 each = +40.
    r.check("DIS == 50", last["profile"]["stats"]["DIS"] == 50, str(last["profile"]["stats"]["DIS"]))
    r.check("totalXp == 40", last["profile"]["totalXp"] == 40, str(last["profile"]["totalXp"]))
    r.check("weeklyCompleted == 2", last["weeklyCompleted"] == 2, str(last["weeklyCompleted"]))


def scenario_plan_edit(c: Client, r: Result, username: str) -> None:
    c.post("/api/username", {"username": username})
    snap = c.get("/api/snapshot")
    rows = plan_rows_from_snapshot(snap)
    removed_name = rows[0]["name"]
    rows = rows[1:]                      # remove first quest
    rows[0]["name"] = "EDITED QUEST"     # rename second
    rows.append({                        # add a brand-new daily quest
        "id": None, "name": "NEW QUEST", "completion_type": "checkbox",
        "target_value": None, "primary_stat": "INT", "is_required": True,
        "cadence": "daily", "sort_order": 99,
    })
    after = c.post("/api/plan", {"rows": rows})
    names = [q["name"] for q in after["dailyQuests"] + after["weeklyQuests"]]
    r.check("removed quest gone", removed_name not in names, removed_name)
    r.check("edited name present", "EDITED QUEST" in names, "")
    r.check("new quest present", "NEW QUEST" in names, "")


def scenario_uncomplete_and_validation(c: Client, r: Result, username: str) -> None:
    # Invalid username rejected.
    bad = c.post("/api/username", {"username": "ab"})
    r.check("short username rejected", bad.get("ok") is False, str(bad))
    good = c.post("/api/username", {"username": username})
    r.check("valid username accepted", good.get("ok") is True, str(good))

    snap = c.get("/api/snapshot")
    q = snap["dailyQuests"][0]
    iid = q["instanceId"]
    done = c.post(f"/api/quests/{iid}/complete")
    dq = next(x for x in done["dailyQuests"] if x["instanceId"] == iid)
    r.check("completed", dq["completed"] is True, "")
    xp_after_complete = done["profile"]["totalXp"]
    r.check("xp awarded on complete", xp_after_complete > 0, str(xp_after_complete))

    un = c.post(f"/api/quests/{iid}/uncomplete")
    uq = next(x for x in un["dailyQuests"] if x["instanceId"] == iid)
    r.check("uncompleted flips flag", uq["completed"] is False, "")
    # Faithful to the original: uncompleting does NOT claw back XP.
    r.check("xp retained after uncomplete (matches TS)",
            un["profile"]["totalXp"] == xp_after_complete, str(un["profile"]["totalXp"]))


SCENARIOS = [
    ("complete_all", scenario_complete_all),
    ("partial_then_complete", scenario_partial_then_complete),
    ("weekly", scenario_weekly),
    ("plan_edit", scenario_plan_edit),
    ("uncomplete_validation", scenario_uncomplete_and_validation),
]


def main() -> int:
    # Preflight: API up?
    try:
        httpx.get(f"{API}/health", timeout=5).raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"API not reachable at {API} ({exc}). Start it: uvicorn app.main:app --port 8000")
        return 2

    created: list[tuple[str, str]] = []
    results: list[Result] = []
    print(f"Creating {N} synthetic users...")
    try:
        for i in range(N):
            uid, email = make_user(i)
            created.append((uid, email))
        print(f"  created {len(created)} users")

        for i, (uid, email) in enumerate(created):
            scen_name, scen = SCENARIOS[i % len(SCENARIOS)]
            username = f"synth_{uuid.uuid4().hex[:8]}"
            r = Result(name=f"#{i+1:02d} [{scen_name}]")
            try:
                token = token_for(email)
                scen(Client(token), r, username)
            except Exception as exc:  # noqa: BLE001
                r.check("scenario ran without error", False, repr(exc))
            results.append(r)
            print(f"  {r.name}: {r.passed}/{len(r.checks)} checks passed")
    finally:
        print(f"\nCleaning up {len(created)} users...")
        for uid, _ in created:
            try:
                admin.auth.admin.delete_user(uid)
            except Exception as exc:  # noqa: BLE001
                print(f"  WARN failed to delete {uid}: {exc}")
        print("  cleanup done")

    # Report
    total = sum(len(r.checks) for r in results)
    passed = sum(r.passed for r in results)
    print("\n" + "=" * 60)
    print(f"RESULT: {passed}/{total} checks passed across {len(results)} customers")
    any_fail = False
    for r in results:
        if r.failed:
            any_fail = True
            print(f"\n  {r.name} FAILURES:")
            for label, _, detail in r.failed:
                print(f"    - {label}  (got: {detail})")
    if not any_fail:
        print("ALL CHECKS PASSED ✅")
    print("=" * 60)
    return 1 if any_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
