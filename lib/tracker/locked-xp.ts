import type { CompletionType, Cadence, StatKind } from '../types';

export interface LockedXpInput {
  completion_type: CompletionType;
  target_value: number | null;
  cadence: Cadence;
}

/**
 * Auto-compute the locked base XP for a quest from its completion type, target,
 * and cadence. Pure: client-sent base_xp is always ignored in favor of this.
 *
 * - checkbox -> 25
 * - count    -> max(15, round(target_value * 0.5))
 * - timer    -> max(15, round(target_value * 0.85))
 * - weekly cadence multiplies the base by 1.5 (rounded)
 */
export function computeLockedXp({ completion_type, target_value, cadence }: LockedXpInput): number {
  let base: number;
  switch (completion_type) {
    case 'checkbox':
      base = 25;
      break;
    case 'count':
      base = Math.max(15, Math.round((target_value ?? 0) * 0.5));
      break;
    case 'timer':
      base = Math.max(15, Math.round((target_value ?? 0) * 0.85));
      break;
  }
  if (cadence === 'weekly') base = Math.round(base * 1.5);
  return base;
}

export function categoryXp(stat: StatKind): number {
  return stat === 'DIS' ? 20 : 10; // INT 10, STR 10, DIS 20
}
