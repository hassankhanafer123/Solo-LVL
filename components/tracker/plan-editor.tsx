"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { StatKind, CompletionType } from "@/lib/types";
import type { TrackerQuest } from "@/lib/tracker/types";
import type { PlanRowInput } from "@/lib/tracker/plan-reconcile";
import { categoryXp } from "@/lib/tracker/locked-xp";

type Stat = StatKind;
type Cadence = "daily" | "weekly";

/* Minimal per-category metadata the planner needs (label/emoji/accent). */
const PLAN_STAT_META: Record<Stat, { label: string; emoji: string }> = {
  INT: { label: "Intelligence", emoji: "🧠" },
  STR: { label: "Strength", emoji: "💪" },
  DIS: { label: "Discipline", emoji: "🕯" },
};

const PLAN_STAT_HEX: Record<Stat, string> = {
  INT: "#60a5fa",
  STR: "#fb7185",
  DIS: "#c084fc",
};

/* Editable row state for the planner. */
type PlanRow = {
  key: string; // stable client key (templateId or generated)
  templateId: string | null; // null for brand-new rows
  name: string;
  stat: Stat;
  completionType: CompletionType;
  targetValue: number | null;
  isRequired: boolean;
};

const PLAN_CATEGORIES: { stat: Stat; cadence: Cadence; min: number }[] = [
  { stat: "INT", cadence: "daily", min: 1 },
  { stat: "STR", cadence: "daily", min: 1 },
  { stat: "DIS", cadence: "weekly", min: 2 },
];

let planKeySeq = 0;
function nextPlanKey(): string {
  planKeySeq += 1;
  return `new-${planKeySeq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function PlanEditor({
  open,
  onClose,
  tasks,
  weekStart,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tasks: TrackerQuest[];
  weekStart: string;
  onSave: (rows: PlanRowInput[]) => void;
}) {
  const [rows, setRows] = useState<PlanRow[]>([]);

  // Seed local editable state from the current tasks whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setRows(
      tasks.map((t) => ({
        key: t.templateId ?? nextPlanKey(),
        templateId: t.templateId,
        name: t.name,
        stat: t.stat,
        completionType: t.completionType,
        targetValue: t.targetValue,
        isRequired: t.isRequired,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateRow(key: string, patch: Partial<PlanRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow(stat: Stat) {
    setRows((prev) => [
      ...prev,
      {
        key: nextPlanKey(),
        templateId: null,
        name: "",
        stat,
        completionType: "count",
        targetValue: 10,
        isRequired: true,
      },
    ]);
  }

  function deleteRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function rowsForStat(stat: Stat): PlanRow[] {
    return rows.filter((r) => r.stat === stat);
  }

  function handleSave() {
    // Enforce category minimums (count only rows with a non-blank name,
    // since blank rows are dropped on submit anyway).
    for (const cat of PLAN_CATEGORIES) {
      const count = rowsForStat(cat.stat).filter((r) => r.name.trim() !== "").length;
      if (count < cat.min) {
        toast.error(
          `${PLAN_STAT_META[cat.stat].label} needs at least ${cat.min} task${cat.min > 1 ? "s" : ""}.`,
        );
        return;
      }
    }

    // Build PlanRowInput[] in display order (INT, STR, DIS), skipping blanks.
    const ordered: PlanRow[] = PLAN_CATEGORIES.flatMap((cat) => rowsForStat(cat.stat));
    const payload: PlanRowInput[] = [];
    ordered.forEach((r) => {
      const name = r.name.trim();
      if (name === "") return;
      const cadence: Cadence = r.stat === "DIS" ? "weekly" : "daily";
      payload.push({
        id: r.templateId,
        name,
        completion_type: r.completionType,
        target_value: r.completionType === "checkbox" ? null : r.targetValue ?? 0,
        primary_stat: r.stat,
        is_required: r.isRequired,
        cadence,
        sort_order: payload.length,
      });
    });

    onSave(payload);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/85 backdrop-blur-xl p-6 pt-20"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950/95 p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-blue-300 mb-1">
                  Week of {weekStart}
                </div>
                <h2 className="text-3xl font-bold text-white">Plan this week</h2>
              </div>
              <button
                onClick={onClose}
                data-cursor="hover"
                aria-label="Close"
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              {PLAN_CATEGORIES.map((cat) => {
                const meta = PLAN_STAT_META[cat.stat];
                const catRows = rowsForStat(cat.stat);
                const xp = categoryXp(cat.stat);
                const atMin = catRows.length <= cat.min;
                return (
                  <div key={cat.stat}>
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="font-mono text-[10px] tracking-[0.4em] uppercase flex items-center gap-2"
                        style={{ color: PLAN_STAT_HEX[cat.stat] }}
                      >
                        <span aria-hidden>{meta.emoji}</span>
                        {meta.label}
                        <span className="text-slate-600">· {cat.cadence}</span>
                      </div>
                      <span className="font-mono text-[9px] tracking-widest uppercase text-slate-500">
                        min {cat.min}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {catRows.map((r) => {
                        const showTarget = r.completionType !== "checkbox";
                        return (
                          <div
                            key={r.key}
                            className={cn(
                              "rounded-2xl border px-4 py-3 transition-colors",
                              cat.cadence === "weekly"
                                ? "border-purple-500/30 bg-purple-500/5"
                                : "border-white/10 bg-white/5",
                            )}
                          >
                            <div className="grid grid-cols-12 gap-3 items-center">
                              <input
                                type="text"
                                value={r.name}
                                placeholder="Task name…"
                                onChange={(e) => updateRow(r.key, { name: e.target.value })}
                                className="col-span-12 md:col-span-6 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-400/60"
                              />
                              <div className="col-span-6 md:col-span-3">
                                {showTarget ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={r.targetValue ?? 0}
                                    onChange={(e) =>
                                      updateRow(r.key, {
                                        targetValue: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white tabular-nums outline-none focus:border-blue-400/60"
                                  />
                                ) : (
                                  <div className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
                                    checkbox
                                  </div>
                                )}
                              </div>
                              {/* Locked XP — fixed by category, read-only */}
                              <div
                                title="XP is locked by category"
                                className="col-span-4 md:col-span-2 flex items-center justify-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-2 text-xs font-mono text-blue-200"
                              >
                                <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                                +{xp} XP
                              </div>
                              <div className="col-span-2 md:col-span-1 flex justify-end">
                                {atMin ? (
                                  <span
                                    title={`min ${cat.min}`}
                                    className="font-mono text-[9px] tracking-widest text-slate-600"
                                  >
                                    min {cat.min}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => deleteRow(r.key)}
                                    data-cursor="hover"
                                    aria-label="Delete task"
                                    className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => addRow(cat.stat)}
                        data-cursor="hover"
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400 hover:border-white/30 hover:text-slate-200 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                        Add {meta.label} task
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                data-cursor="hover"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-300 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                data-cursor="hover"
                className="rounded-full bg-blue-500 px-5 py-2 font-mono text-[10px] tracking-[0.3em] uppercase text-white hover:bg-blue-400 transition-colors"
              >
                Save plan
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
