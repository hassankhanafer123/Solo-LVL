"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import type { ActiveDuelSummary } from "@/lib/tracker/types";

export function DuelBanner({
  duel,
  partyHref,
}: {
  duel: ActiveDuelSummary | null | undefined;
  partyHref: string;
}) {
  if (!duel) return null;
  const leading = duel.myScore >= duel.opponentScore;
  return (
    <Link
      href={partyHref}
      className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 backdrop-blur-xl hover:bg-red-500/15 transition-colors"
    >
      <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase text-red-300">
        <Swords className="h-3.5 w-3.5" strokeWidth={2.5} />
        Duel vs {duel.opponentUsername ?? "hunter"}
      </span>
      <span className="font-mono text-xs tabular-nums font-bold">
        <span className={leading ? "text-emerald-300" : "text-slate-300"}>{duel.myScore}</span>
        <span className="text-slate-500"> : </span>
        <span className={!leading ? "text-red-300" : "text-slate-300"}>{duel.opponentScore}</span>
      </span>
    </Link>
  );
}
