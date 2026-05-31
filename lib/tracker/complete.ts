import { type XpInput, type XpResult } from '../xp';
import { computePartialXp } from '../quests';

export interface CompletionInstanceState {
  actual_value: number;
  target_value: number | null;
  base_xp: number;
  completed: boolean;
}

export interface CompletionDecision {
  alreadyComplete: boolean;
  xpAward: number;
  xpResult: XpResult | null;
}

/** Pure: decides XP to award for completing an instance and the resulting profile. */
export function decideCompletion(
  instance: CompletionInstanceState,
  profile: XpInput,
): CompletionDecision {
  if (instance.completed) {
    return { alreadyComplete: true, xpAward: 0, xpResult: null };
  }
  const xpAward = computePartialXp({
    actual: instance.actual_value,
    target: instance.target_value,
    base_xp: instance.base_xp,
  });
  const xpResult: XpResult = {
    ...profile,
    total_xp: profile.total_xp + xpAward,
    xp_in_level: profile.xp_in_level + xpAward,
    level: profile.level,
    xp_to_next: profile.xp_to_next,
    unallocated_points: profile.unallocated_points,
    title: profile.title,
    levels_gained: 0,
    title_unlocked: null,
  };
  return { alreadyComplete: false, xpAward, xpResult };
}
