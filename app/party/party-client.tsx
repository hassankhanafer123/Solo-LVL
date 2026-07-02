"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Crown, Shield, Swords, X } from "lucide-react";
import { useTrackerApi, useIsDemo } from "@/lib/demo/context";
import type { DuelEntry, FeedEventView, PartyView } from "@/lib/api/types";

const FEED_LABEL: Record<FeedEventView["kind"], (e: FeedEventView) => string> = {
  quest_complete: (e) => `cleared “${e.payload.name}” (+${e.payload.xp} XP)`,
  level_up: (e) => `reached Level ${e.payload.toLevel} — ${e.payload.title}`,
  weekly_goal_hit: (e) => `hit the weekly goal “${e.payload.name}”`,
  member_joined: () => "joined the party",
  duel_started: () => "started a duel",
  duel_won: () => "won a duel",
};

function timeAgo(isoDate: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(isoDate)) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PartyClient({ view: initialView }: { view: PartyView }) {
  const api = useTrackerApi();
  const isDemo = useIsDemo();
  const backHref = isDemo ? "/demo" : "/";
  const [view, setView] = useState<PartyView>(initialView);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  function act(fn: () => Promise<PartyView>) {
    startTransition(async () => {
      try {
        setView(await fn());
      } catch {
        toast.error("Couldn't reach the server. Try again.");
      }
    });
  }

  function actResult(fn: () => Promise<{ ok: boolean; error: string | null; view: PartyView | null }>) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok && res.view) setView(res.view);
        else toast.error(res.error ?? "Something went wrong.");
      } catch {
        toast.error("Couldn't reach the server. Try again.");
      }
    });
  }

  const me = view.members.find((m) => m.userId === view.myUserId);
  const pendingForMe = view.duels.filter(
    (d) => d.status === "pending" && d.opponentId === view.myUserId,
  );
  const visibleDuels = view.duels.filter((d) => d.status !== "declined");

  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 px-4 py-8 overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(59,130,246,0.12) 0%, transparent 60%)",
          }}
        />
        <div className="grain" />
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Back
          </Link>
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-blue-300">
            DayMaxing
          </div>
        </div>

        {!view.party ? (
          /* ---- no-party state: create or join ---- */
          <div>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-6 w-6 text-blue-400" strokeWidth={2} />
                <h1 className="text-4xl font-bold text-white">Your Party</h1>
              </div>
              <p className="text-slate-400 text-sm">
                Team up with up to 8 hunters. Duel each other, see each other&apos;s
                progress, climb together.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6 mb-4">
              <h2 className="font-semibold text-white mb-3">Create a party</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Party name (3–24 chars)"
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => actResult(() => api.createParty(name.trim()))}
                  disabled={isPending || name.trim().length < 3}
                  className="rounded-xl bg-blue-500 px-5 py-3 font-mono text-xs tracking-[0.2em] uppercase text-white hover:bg-blue-400 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
              <h2 className="font-semibold text-white mb-3">Join with a code</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="6-char code"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 font-mono tracking-[0.3em] text-white placeholder-slate-600 focus:outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => actResult(() => api.joinParty(code.trim()))}
                  disabled={isPending || code.trim().length < 4}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-mono text-xs tracking-[0.2em] uppercase text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ---- party state ---- */
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <Shield className="h-6 w-6 text-blue-400" strokeWidth={2} />
                <h1 className="text-4xl font-bold text-white">{view.party.name}</h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span>
                  {view.members.length}/8 hunters · {view.party.combinedXp.toLocaleString()} combined XP
                </span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(view.party!.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] tracking-[0.25em] text-blue-200 hover:bg-white/10 transition-colors"
                >
                  {view.party.code}
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-300" strokeWidth={2.5} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>

            {/* pending challenges against me */}
            {pendingForMe.map((d) => (
              <div
                key={d.id}
                className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 text-sm text-amber-100">
                  <Swords className="h-4 w-4 text-amber-300" strokeWidth={2.5} />
                  <span>
                    <strong>{d.challengerUsername}</strong> challenged you to a duel
                    (this week&apos;s XP).
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => act(() => api.acceptDuel(d.id))}
                    disabled={isPending}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-slate-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => act(() => api.declineDuel(d.id))}
                    disabled={isPending}
                    aria-label="Decline"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}

            {/* active/finished duels */}
            {visibleDuels
              .filter((d) => d.status === "active")
              .map((d) => (
                <DuelCard key={d.id} duel={d} myUserId={view.myUserId} />
              ))}

            {/* roster, ranked by weekly XP */}
            <h2 className="mt-8 mb-3 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
              This week
            </h2>
            <div className="space-y-2">
              {view.members.map((m, idx) => {
                const isMe = m.userId === view.myUserId;
                const hasOpenDuel = view.duels.some(
                  (d) =>
                    ["pending", "active"].includes(d.status) &&
                    [d.challengerId, d.opponentId].includes(m.userId) &&
                    [d.challengerId, d.opponentId].includes(view.myUserId),
                );
                return (
                  <div
                    key={m.userId}
                    className={
                      isMe
                        ? "rounded-2xl border border-blue-500/50 bg-blue-500/10 backdrop-blur-xl px-4 py-3.5"
                        : "rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur-xl px-4 py-3.5"
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 shrink-0 text-center">
                        {idx === 0 ? (
                          <Crown className="h-5 w-5 text-yellow-400 mx-auto" strokeWidth={2} />
                        ) : (
                          <span className="font-mono text-sm font-bold tabular-nums text-slate-400">
                            #{idx + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold truncate ${isMe ? "text-blue-200" : "text-white"}`}>
                            {m.username ?? "hunter"}
                          </span>
                          {m.isLeader && (
                            <span className="rounded border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-yellow-300">
                              leader
                            </span>
                          )}
                          {isMe && (
                            <span className="rounded border border-blue-500/50 bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-blue-300">
                              you
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] tracking-widest uppercase text-slate-500">
                          Lv {m.level} · {m.duelWins}
                          <Swords className="mx-1 inline h-3 w-3" strokeWidth={2.5} />
                          wins
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <div className="text-right font-mono text-xs tabular-nums">
                          <div className="text-slate-400 text-[10px] tracking-widest uppercase">Week</div>
                          <div className="text-blue-300 font-bold">{m.weeklyXp.toLocaleString()} XP</div>
                        </div>
                        {!isMe && !hasOpenDuel && (
                          <button
                            onClick={() => actResult(() => api.challengeDuel(m.userId))}
                            disabled={isPending}
                            aria-label={`Challenge ${m.username ?? "hunter"}`}
                            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50"
                          >
                            <Swords className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* feed */}
            <h2 className="mt-8 mb-3 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
              Activity
            </h2>
            {view.feed.length === 0 ? (
              <p className="text-sm text-slate-500">
                Quiet so far — clear a quest and it&apos;ll show up here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {view.feed.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-baseline gap-2 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-slate-200">{e.username ?? "hunter"}</span>
                    <span className="text-slate-400 min-w-0 flex-1 truncate">
                      {FEED_LABEL[e.kind]?.(e) ?? e.kind}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-600">
                      {timeAgo(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* leave */}
            <div className="mt-8 text-center">
              <button
                onClick={() => act(() => api.leaveParty())}
                disabled={isPending}
                className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
              >
                {isPending ? "Updating..." : "Leave party"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function DuelCard({ duel, myUserId }: { duel: DuelEntry; myUserId: string }) {
  const iAmChallenger = duel.challengerId === myUserId;
  const my = iAmChallenger ? duel.challengerScore : duel.opponentScore;
  const their = iAmChallenger ? duel.opponentScore : duel.challengerScore;
  const them = iAmChallenger ? duel.opponentUsername : duel.challengerUsername;
  const total = Math.max(1, my + their);
  const endsIn = duel.endsAt
    ? Math.max(0, Math.ceil((Date.parse(duel.endsAt) - Date.now()) / 86_400_000))
    : null;
  return (
    <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/5 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase text-red-300">
          <Swords className="h-3.5 w-3.5" strokeWidth={2.5} />
          Duel vs {them ?? "hunter"}
        </div>
        {endsIn !== null && (
          <span className="font-mono text-[10px] text-slate-500">
            {endsIn === 0 ? "ends today" : `${endsIn}d left`}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between font-mono text-sm tabular-nums mb-1.5">
        <span className="text-blue-300 font-bold">{my} XP you</span>
        <span className="text-slate-300 font-bold">{them ?? "them"} {their} XP</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="bg-blue-400 transition-all" style={{ width: `${(my / total) * 100}%` }} />
        <div className="bg-red-400/70 transition-all" style={{ width: `${(their / total) * 100}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Loser takes a +50% penalty quest. Week&apos;s XP decides it.
      </p>
    </div>
  );
}
