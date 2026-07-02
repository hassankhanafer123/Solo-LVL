"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Sparkles, User } from "lucide-react";
import { api } from "@/lib/api/client";

export default function WelcomePage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await api.setUsername(value);
    if (result.ok) {
      router.push("/");
    } else {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 flex items-center justify-center px-6 overflow-hidden">
      {/* Atmospheric backdrop */}
      <div aria-hidden className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(168,85,247,0.15) 0%, transparent 60%)",
          }}
        />
        <div className="grain" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-purple-300 mb-3">
            DayMaxing
          </div>
          <h1 className="text-5xl font-bold text-white">Pick your username.</h1>
          <p className="mt-3 text-slate-400 text-sm">
            This is how you&apos;ll show up — and your name on the leaderboard.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6"
        >
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
              Username
            </span>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 focus-within:border-purple-400 transition-colors">
              <User className="h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                autoFocus
                placeholder="your_username"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={pending}
                className="flex-1 bg-transparent py-3 text-white placeholder-slate-600 focus:outline-none disabled:opacity-50"
              />
            </div>
          </label>

          <p className="mt-2 font-mono text-[10px] tracking-widest text-slate-600">
            3–20 letters, numbers, or underscores.
          </p>

          {error && (
            <p className="mt-3 text-xs text-red-300" role="alert">
              {error}
            </p>
          )}

          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={pending || !value.trim()}
            className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-purple-500 px-5 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white hover:bg-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? (
              "Saving..."
            ) : (
              <>
                <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                Set username
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
