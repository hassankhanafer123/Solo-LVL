import type { QuestTemplate, QuestInstance } from './types';

export function buildInstancesFromTemplate(
  templates: ReadonlyArray<QuestTemplate>,
  dailyLogId: string,
  userId: string
): Omit<QuestInstance, 'id'>[] {
  return templates
    .filter((t) => t.active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      user_id: userId,
      daily_log_id: dailyLogId,
      template_id: t.id,
      name: t.name,
      completion_type: t.completion_type,
      target_value: t.target_value,
      actual_value: 0,
      primary_stat: t.primary_stat,
      base_xp: t.base_xp,
      xp_awarded: 0,
      is_required: t.is_required,
      is_penalty: false,
      completed: false,
      completed_at: null,
      timer_started_at: null,
    }));
}

export function computePartialXp(args: {
  actual: number;
  target: number | null;
  base_xp: number;
}): number {
  const { actual, target, base_xp } = args;
  if (target === null) return actual >= 1 ? base_xp : 0;
  if (actual >= target) return base_xp;
  if (actual <= 0) return 0;
  return Math.floor((actual / target) * base_xp);
}

export function pickPenaltyTarget(
  templates: ReadonlyArray<QuestTemplate>,
  rng: () => number = Math.random
): QuestTemplate | null {
  const candidates = templates.filter((t) => t.active && t.is_required);
  if (candidates.length === 0) return null;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)] ?? null;
}

export function buildPenaltyInstance(
  source: QuestTemplate,
  dailyLogId: string,
  userId: string
): Omit<QuestInstance, 'id'> {
  const newTarget = source.target_value === null ? null : Math.ceil(source.target_value * 1.5);
  return {
    user_id: userId,
    daily_log_id: dailyLogId,
    template_id: null,
    name: `${source.name} (Penalty +50%)`,
    completion_type: source.completion_type,
    target_value: newTarget,
    actual_value: 0,
    primary_stat: source.primary_stat,
    base_xp: Math.ceil(source.base_xp * 1.5),
    xp_awarded: 0,
    is_required: true,
    is_penalty: true,
    completed: false,
    completed_at: null,
    timer_started_at: null,
  };
}

export interface DailyClearResult {
  status: 'cleared' | 'pending';
  required_remaining: number;
}

export function evaluateDailyClear(
  instances: ReadonlyArray<Pick<QuestInstance, 'is_required' | 'completed'>>
): DailyClearResult {
  const required = instances.filter((i) => i.is_required);
  const remaining = required.filter((i) => !i.completed).length;
  return {
    status: remaining === 0 ? 'cleared' : 'pending',
    required_remaining: remaining,
  };
}
