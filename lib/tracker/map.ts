import type { QuestInstance, WeeklyQuestInstance, Profile, Cadence } from '../types';
import type { TrackerQuest, TrackerProfile } from './types';

export function toTrackerQuest(
  i: QuestInstance | WeeklyQuestInstance,
  cadence: Cadence,
): TrackerQuest {
  const isPenalty = 'is_penalty' in i ? i.is_penalty : false;
  const isRequired = 'is_required' in i ? i.is_required : true;
  return {
    instanceId: i.id,
    templateId: i.template_id,
    name: i.name,
    stat: i.primary_stat,
    completionType: i.completion_type,
    targetValue: i.target_value,
    actualValue: i.actual_value,
    baseXp: i.base_xp,
    xpAwarded: i.xp_awarded,
    isRequired,
    isPenalty,
    completed: i.completed,
    cadence,
  };
}

export function toTrackerProfile(p: Profile): TrackerProfile {
  return {
    displayName: p.display_name,
    username: p.username,
    level: p.level,
    title: p.title,
    xpInLevel: p.xp_in_level,
    xpToNext: p.xp_to_next,
    totalXp: p.total_xp,
    streakCurrent: p.streak_current,
    streakBest: p.streak_best,
    stats: { INT: p.stat_int, STR: p.stat_str, DIS: p.stat_dis },
  };
}
