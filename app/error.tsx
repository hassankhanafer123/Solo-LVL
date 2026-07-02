"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-purple-300 mb-3">
          DayMaxing
        </div>
        <h1 className="text-3xl font-bold text-white">The gate didn&apos;t open.</h1>
        <p className="mt-3 text-slate-400 text-sm">
          We couldn&apos;t reach the server. It may just be waking up — try again in a
          few seconds.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-xl bg-purple-500 px-6 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white hover:bg-purple-400 transition-colors"
        >
          Retry
        </button>
      </div>
    </main>
  );
}
