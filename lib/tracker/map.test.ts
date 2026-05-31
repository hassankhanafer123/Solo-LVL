import { describe, it, expect } from 'vitest';
import { toTrackerQuest, toTrackerProfile } from './map';
import type { QuestInstance, Profile } from '../types';

const inst = {
  id: 'i1', template_id: 't1', name: 'Push-ups', completion_type: 'count',
  target_value: 100, actual_value: 40, primary_stat: 'STR', base_xp: 50,
  xp_awarded: 0, is_required: true, is_penalty: false, completed: false,
} as unknown as QuestInstance;

describe('mappers', () => {
  it('maps a daily instance to a TrackerQuest', () => {
    const q = toTrackerQuest(inst, 'daily');
    expect(q).toMatchObject({
      instanceId: 'i1', templateId: 't1', name: 'Push-ups', stat: 'STR',
      completionType: 'count', targetValue: 100, actualValue: 40, baseXp: 50,
      isRequired: true, isPenalty: false, completed: false, cadence: 'daily',
    });
  });

  it('maps a profile, exposing stats in INT/STR/DIS order', () => {
    const p = { display_name: 'Hassan', level: 14, title: 'Awakened', xp_in_level: 420,
      xp_to_next: 1000, total_xp: 5000, stat_int: 51, stat_str: 42, stat_dis: 36,
      streak_current: 23, streak_best: 30 } as unknown as Profile;
    expect(toTrackerProfile(p)).toMatchObject({
      displayName: 'Hassan', level: 14, stats: { INT: 51, STR: 42, DIS: 36 },
      streakCurrent: 23, streakBest: 30,
    });
  });
});
