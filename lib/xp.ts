export type Title = 'Novice' | 'Awakened' | 'Elite Hunter' | 'Necromancer' | 'Shadow Monarch';

export const TITLE_BONUS: Record<Title, number> = {
  Novice: 1.0,
  Awakened: 1.05,
  'Elite Hunter': 1.10,
  Necromancer: 1.15,
  'Shadow Monarch': 1.20,
};

// Ordered highest-threshold first so the first match wins.
const TITLE_THRESHOLDS: ReadonlyArray<readonly [number, Title]> = [
  [100, 'Shadow Monarch'],
  [50, 'Necromancer'],
  [25, 'Elite Hunter'],
  [10, 'Awakened'],
  [1, 'Novice'],
] as const;

export function xpToNext(level: number): number {
  if (level < 1) throw new Error('level must be >= 1');
  return Math.ceil(150 * Math.pow(1.15, level - 1));
}

export interface WeeklyLevelInput { level: number; completionPct: number; }
export interface WeeklyLevelResult { leveledUp: boolean; newLevel: number; }
/** Leveling v2: a week with >=85% completion grants one level. */
export function decideWeeklyLevelUp(input: WeeklyLevelInput): WeeklyLevelResult {
  if (input.completionPct >= 0.85) return { leveledUp: true, newLevel: input.level + 1 };
  return { leveledUp: false, newLevel: input.level };
}

export function titleForLevel(level: number): Title {
  for (const entry of TITLE_THRESHOLDS) {
    // entry is readonly [number, Title] — both indices are always present.
    const threshold = entry[0] as number;
    const title = entry[1] as Title;
    if (level >= threshold) return title;
  }
  // Unreachable: TITLE_THRESHOLDS covers all positive levels (threshold 1).
  return 'Novice';
}

export interface XpInput {
  level: number;
  total_xp: number;
  xp_in_level: number;
  xp_to_next: number;
  unallocated_points: number;
  title: Title;
}

export interface XpResult extends XpInput {
  levels_gained: number;
  title_unlocked: Title | null;
}

export function applyXpGain(profile: XpInput, rawXp: number): XpResult {
  if (rawXp < 0) throw new Error('rawXp must be >= 0');
  if (rawXp === 0) {
    return { ...profile, levels_gained: 0, title_unlocked: null };
  }

  const bonus = TITLE_BONUS[profile.title];
  const xp = Math.floor(rawXp * bonus);

  let level = profile.level;
  let xpInLevel = profile.xp_in_level + xp;
  let threshold = profile.xp_to_next;
  let pointsGained = 0;
  let levelsGained = 0;
  const startTitle = profile.title;

  while (xpInLevel >= threshold) {
    xpInLevel -= threshold;
    level += 1;
    levelsGained += 1;
    pointsGained += 5;
    threshold = xpToNext(level);
  }

  const newTitle = titleForLevel(level);
  const titleUnlocked = newTitle !== startTitle ? newTitle : null;

  return {
    level,
    total_xp: profile.total_xp + xp,
    xp_in_level: xpInLevel,
    xp_to_next: threshold,
    unallocated_points: profile.unallocated_points + pointsGained,
    title: newTitle,
    levels_gained: levelsGained,
    title_unlocked: titleUnlocked,
  };
}
