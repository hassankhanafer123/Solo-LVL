'use client';
import Link from 'next/link';
import { Sparkles, RotateCcw } from 'lucide-react';

export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-blue-500/30 bg-blue-950/80 px-4 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs text-blue-100">
        <Sparkles className="h-3.5 w-3.5 text-blue-300" strokeWidth={2.5} />
        <span className="font-medium">Demo mode</span>
        <span className="hidden text-blue-300/80 sm:inline">— changes save in this browser only.</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-200 hover:bg-white/10"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
        <Link
          href="/login"
          className="rounded-lg bg-blue-500 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-blue-400"
        >
          Sign up to save
        </Link>
      </div>
    </div>
  );
}
