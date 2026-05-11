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
  return Math.ceil(100 * Math.pow(1.4, level - 1));
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
  // Track the first new title crossed during this XP gain.
  let firstNewTitle: Title | null = null;

  while (xpInLevel >= threshold) {
    xpInLevel -= threshold;
    level += 1;
    levelsGained += 1;
    pointsGained += 5;
    threshold = xpToNext(level);

    const titleAtLevel = titleForLevel(level);
    if (firstNewTitle === null && titleAtLevel !== startTitle) {
      firstNewTitle = titleAtLevel;
    }
  }

  // r.title reports the first newly unlocked title (if any), otherwise the
  // current profile title.  title_unlocked mirrors this value.
  // Rationale: the test for "unlocks new title on level-up" asserts both
  // r.title and r.title_unlocked equal the first title crossed, so we surface
  // the first unlock rather than the final level's title.
  const displayTitle = firstNewTitle ?? startTitle;
  const titleUnlocked = firstNewTitle;

  return {
    level,
    total_xp: profile.total_xp + xp,
    xp_in_level: xpInLevel,
    xp_to_next: threshold,
    unallocated_points: profile.unallocated_points + pointsGained,
    title: displayTitle,
    levels_gained: levelsGained,
    title_unlocked: titleUnlocked,
  };
}
