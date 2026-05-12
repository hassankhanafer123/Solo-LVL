// TEASER PREVIEW — static mockup of the dashboard.
// All data is hardcoded. Phase 2 wires this to Supabase.

const TODAY = new Date().toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const player = {
  name: "HASSAN",
  level: 14,
  title: "Awakened",
  xp: 720,
  xpToNext: 1000,
  streak: 23,
};

type Quest = {
  id: string;
  name: string;
  stat: "STR" | "VIT" | "AGI" | "INT" | "PER";
  baseXp: number;
  required: boolean;
  penalty?: boolean;
  control:
    | { kind: "checkbox"; done: boolean }
    | { kind: "count"; actual: number; target: number; done: boolean }
    | { kind: "timer"; elapsedSec: number; targetMin: number; running: boolean; done: boolean };
};

const quests: Quest[] = [
  {
    id: "q1",
    name: "Push-ups",
    stat: "STR",
    baseXp: 50,
    required: true,
    control: { kind: "count", actual: 100, target: 100, done: true },
  },
  {
    id: "q2",
    name: "Sit-ups",
    stat: "STR",
    baseXp: 50,
    required: true,
    control: { kind: "count", actual: 47, target: 100, done: false },
  },
  {
    id: "q3",
    name: "Study",
    stat: "INT",
    baseXp: 75,
    required: true,
    control: { kind: "timer", elapsedSec: 1380, targetMin: 90, running: true, done: false },
  },
  {
    id: "q4",
    name: "Run",
    stat: "VIT",
    baseXp: 75,
    required: true,
    control: { kind: "count", actual: 0, target: 5, done: false },
  },
  {
    id: "q5",
    name: "Read",
    stat: "INT",
    baseXp: 25,
    required: false,
    control: { kind: "timer", elapsedSec: 0, targetMin: 30, running: false, done: false },
  },
  {
    id: "q6",
    name: "Squats (Penalty +50%)",
    stat: "STR",
    baseXp: 75,
    required: true,
    penalty: true,
    control: { kind: "count", actual: 0, target: 150, done: false },
  },
];

const remaining = quests.filter((q) => q.required && !q.control.done).length;
const xpPct = Math.min(100, (player.xp / player.xpToNext) * 100);

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6 pb-24 max-w-2xl mx-auto space-y-6">
      {/* Brand */}
      <div className="text-center pb-2">
        <div className="font-mono text-[10px] tracking-[0.4em] text-blue-400/70">SYSTEM</div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-zinc-600 mt-1">
          STATIC PREVIEW · PHASE 2 WIRES THIS TO LIVE DATA
        </div>
      </div>

      {/* Player header */}
      <header className="space-y-3 border border-zinc-800 rounded-xl p-5 bg-gradient-to-b from-zinc-900/60 to-zinc-950">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-mono tracking-tight">{player.name}</h1>
          <span className="text-sm text-blue-400 font-mono">
            Lv {player.level} · {player.title}
          </span>
        </div>
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500 font-mono tabular-nums">
            <span>
              {player.xp} / {player.xpToNext} XP
            </span>
            <span className="text-orange-400">🔥 {player.streak}-day streak</span>
          </div>
        </div>
      </header>

      {/* Relax Gate */}
      {remaining === 0 ? (
        <div className="border border-emerald-500/40 bg-emerald-950/40 rounded-xl p-5 text-center shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <div className="text-emerald-400 font-mono text-xl tracking-widest">CLEARED</div>
          <div className="text-emerald-200/80 text-sm mt-1">You may rest, Hunter.</div>
        </div>
      ) : (
        <div className="border border-red-500/40 bg-red-950/40 rounded-xl p-5 text-center shadow-[0_0_30px_rgba(239,68,68,0.12)]">
          <div className="text-red-400 font-mono text-xl tracking-widest">LOCKED</div>
          <div className="text-red-200/80 text-sm mt-1">
            {remaining} quest{remaining === 1 ? "" : "s"} remaining. Train, Hunter.
          </div>
        </div>
      )}

      {/* Today */}
      <section className="space-y-3">
        <h2 className="text-xs font-mono text-zinc-500 tracking-widest uppercase">
          TODAY · {TODAY}
        </h2>
        <ul className="space-y-2">
          {quests.map((q) => (
            <li
              key={q.id}
              className={`rounded-lg p-3 border transition-colors ${
                q.control.done
                  ? "border-emerald-800/40 bg-emerald-950/15"
                  : q.penalty
                    ? "border-red-700/40 bg-red-950/20"
                    : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {q.penalty && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                        PENALTY
                      </span>
                    )}
                    {!q.required && !q.penalty && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-400">
                        OPTIONAL
                      </span>
                    )}
                    <span
                      className={`font-medium ${
                        q.control.done ? "line-through text-zinc-500" : "text-zinc-100"
                      }`}
                    >
                      {q.name}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 font-mono tracking-wide">
                    {q.stat} · +{q.baseXp} XP
                  </div>
                </div>

                {/* Right-side control */}
                <div className="shrink-0">
                  {q.control.kind === "checkbox" && (
                    <button
                      type="button"
                      className={`h-9 px-4 rounded font-mono text-sm ${
                        q.control.done
                          ? "bg-emerald-600/30 text-emerald-300 border border-emerald-600/40"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
                      }`}
                    >
                      {q.control.done ? "✓" : "Done"}
                    </button>
                  )}

                  {q.control.kind === "count" && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums text-zinc-300">
                        <span
                          className={
                            q.control.actual >= q.control.target
                              ? "text-emerald-400"
                              : "text-zinc-200"
                          }
                        >
                          {q.control.actual}
                        </span>
                        <span className="text-zinc-600"> / {q.control.target}</span>
                      </span>
                    </div>
                  )}

                  {q.control.kind === "timer" && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums text-zinc-300">
                        {fmt(q.control.elapsedSec)}
                        <span className="text-zinc-600">
                          {" "}
                          / {String(q.control.targetMin).padStart(2, "0")}:00
                        </span>
                      </span>
                      <button
                        type="button"
                        className={`h-9 w-9 rounded font-mono ${
                          q.control.running
                            ? "bg-red-600 hover:bg-red-500 text-white"
                            : "bg-blue-600 hover:bg-blue-500 text-white"
                        }`}
                      >
                        {q.control.running ? "■" : "▶"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar for count/timer in-progress */}
              {!q.control.done && q.control.kind !== "checkbox" && (
                <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${q.penalty ? "bg-red-500" : "bg-blue-500"}`}
                    style={{
                      width: `${
                        q.control.kind === "count"
                          ? Math.min(100, (q.control.actual / q.control.target) * 100)
                          : Math.min(
                              100,
                              (q.control.elapsedSec / (q.control.targetMin * 60)) * 100,
                            )
                      }%`,
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Stat sheet */}
      <section className="border border-zinc-800 rounded-xl p-5 space-y-3 bg-zinc-900/30">
        <h2 className="text-xs font-mono text-zinc-500 tracking-widest uppercase mb-1">
          STATS
        </h2>
        {(
          [
            ["STR", 42],
            ["VIT", 38],
            ["AGI", 29],
            ["INT", 51],
            ["PER", 24],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="space-y-1">
            <div className="flex justify-between text-sm font-mono">
              <span className="text-zinc-300">{k}</span>
              <span className="text-blue-400 tabular-nums">{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-blue-500/80" style={{ width: `${(v / 60) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 px-4 py-2 flex justify-around text-xs font-mono tracking-wider">
        <span className="text-blue-400 px-3 py-1.5">HOME</span>
        <span className="text-zinc-500 px-3 py-1.5">STATS</span>
        <span className="text-zinc-500 px-3 py-1.5">HISTORY</span>
        <span className="text-zinc-500 px-3 py-1.5">SETTINGS</span>
      </nav>
    </main>
  );
}
