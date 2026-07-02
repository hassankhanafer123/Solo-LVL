"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trophy, ArrowLeft, Crown } from "lucide-react";
import { api } from "@/lib/api/client";
import type { LeaderboardView } from "@/lib/api/types";

export function LeaderboardClient({ view: initialView }: { view: LeaderboardView }) {
  const [view, setView] = useState<LeaderboardView>(initialView);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      try {
        const updated = await api.joinLeaderboard();
        setView(updated);
      } catch {
        toast.error("Could not join leaderboard. Try again.");
      }
    });
  }

  function handleLeave() {
    startTransition(async () => {
      try {
        const updated = await api.leaveLeaderboard();
        setView(updated);
      } catch {
        toast.error("Could not leave leaderboard. Try again.");
      }
    });
  }

  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 px-4 py-8 overflow-hidden">
      {/* Atmospheric backdrop */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(168,85,247,0.12) 0%, transparent 60%)",
          }}
        />
        <div className="grain" />
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Back
          </Link>
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-purple-300">
            DayMaxing
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-6 w-6 text-yellow-400" strokeWidth={2} />
            <h1 className="text-4xl font-bold text-white">Leaderboard</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Global rankings by level and total XP.
          </p>
        </div>

        {!view.optedIn ? (
          /* ---- Opt-in card ---- */
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-purple-500/15 mb-6">
              <Trophy className="h-8 w-8 text-purple-300" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Join the global leaderboard
            </h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-8">
              Compete on level and total XP with everyone who&apos;s opted in.
              Your username will be visible to all participants.
            </p>
            <button
              onClick={handleJoin}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-500 px-6 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white hover:bg-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trophy className="h-4 w-4" strokeWidth={2.5} />
              {isPending ? "Joining..." : "Join leaderboard"}
            </button>
          </div>
        ) : (
          /* ---- Ranked list ---- */
          <div>
            {view.entries.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-8 text-center">
                <p className="text-slate-300 text-sm">
                  No one&apos;s on the board yet — you&apos;re first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {view.entries.map((entry) => {
                  const isMe = entry.username === view.myUsername;
                  const isFirst = entry.rank === 1;
                  return (
                    <div
                      key={entry.username}
                      className={
                        isMe
                          ? "relative rounded-2xl border border-purple-500/50 bg-purple-500/10 backdrop-blur-xl px-4 py-3.5"
                          : "relative rounded-2xl border border-white/10 bg-slate-950/55 backdrop-blur-xl px-4 py-3.5"
                      }
                    >
                      <div className="flex items-center gap-4">
                        {/* Rank */}
                        <div className="w-8 shrink-0 text-center">
                          {isFirst ? (
                            <Crown className="h-5 w-5 text-yellow-400 mx-auto" strokeWidth={2} />
                          ) : (
                            <span className="font-mono text-sm font-bold tabular-nums text-slate-400">
                              #{entry.rank}
                            </span>
                          )}
                        </div>

                        {/* Username */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold truncate ${isMe ? "text-purple-200" : "text-white"}`}>
                              {entry.username}
                            </span>
                            {isMe && (
                              <span className="rounded border border-purple-500/50 bg-purple-500/20 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-purple-300">
                                you
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="shrink-0 flex items-center gap-3 font-mono text-xs tabular-nums text-right">
                          <div className="text-right">
                            <div className="text-slate-400 text-[10px] tracking-widest uppercase">Level</div>
                            <div className="text-white font-bold">Lv {entry.level}</div>
                          </div>
                          <div className="text-right hidden sm:block">
                            <div className="text-slate-400 text-[10px] tracking-widest uppercase">XP</div>
                            <div className="text-blue-300 font-bold">
                              {entry.totalXp.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Leave button */}
            <div className="mt-6 text-center">
              <button
                onClick={handleLeave}
                disabled={isPending}
                className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
              >
                {isPending ? "Updating..." : "Leave leaderboard"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
