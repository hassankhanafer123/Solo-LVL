"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Mail, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
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
              "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.15) 0%, transparent 60%)",
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
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-blue-300 mb-3">
            DayMaxing
          </div>
          <h1 className="text-5xl font-bold text-white">
            {status === "sent" ? "Check your email." : "Sign in."}
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            {status === "sent"
              ? `We sent a magic link to ${email}.`
              : "Enter your email — we'll send you a one-click sign-in link."}
          </p>
        </div>

        {status !== "sent" && (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6"
          >
            <label className="block">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
                Email
              </span>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 focus-within:border-blue-400 transition-colors">
                <Mail className="h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "sending"}
                  className="flex-1 bg-transparent py-3 text-white placeholder-slate-600 focus:outline-none disabled:opacity-50"
                />
              </div>
            </label>

            {error && (
              <p className="mt-3 text-xs text-red-300" role="alert">
                {error}
              </p>
            )}

            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={status === "sending" || !email}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 font-mono text-xs tracking-[0.3em] uppercase text-white hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "sending" ? (
                "Sending..."
              ) : (
                <>
                  <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                  Send magic link
                </>
              )}
            </motion.button>
          </form>
        )}

        {status === "sent" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-xl p-8 text-center"
          >
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/20 mb-4">
              <Check className="h-7 w-7 text-emerald-300" strokeWidth={2.5} />
            </div>
            <p className="text-sm text-slate-300">
              Open the link in your inbox. You can close this tab.
            </p>
            <button
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="mt-6 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500 hover:text-slate-200 transition-colors"
            >
              Use a different email
            </button>
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}
