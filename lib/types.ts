import { z } from 'zod';

export const STATS = ['INT', 'STR', 'DIS'] as const;
export type StatKind = (typeof STATS)[number];

export const COMPLETION_TYPES = ['checkbox', 'count', 'timer'] as const;
export type CompletionType = (typeof COMPLETION_TYPES)[number];

export const DAILY_STATUSES = ['pending', 'cleared', 'missed'] as const;
export type DailyStatus = (typeof DAILY_STATUSES)[number];

export interface Profile {
  user_id: string;
  display_name: string;
  level: number;
  total_xp: number;
  xp_in_level: number;
  xp_to_next: number;
  stat_int: number;
  stat_str: number;
  stat_dis: number;
  unallocated_points: number;
  title: string;
  streak_current: number;
  streak_best: number;
  reset_hour_local: number;
  email_target: string | null;
  email_enabled: boolean;
  email_send_hour_local: number;
  timezone: string;
}

export interface QuestTemplate {
  id: string;
  user_id: string;
  name: string;
  completion_type: CompletionType;
  target_value: number | null;
  primary_stat: StatKind;
  base_xp: number;
  is_required: boolean;
  sort_order: number;
  active: boolean;
}

export interface QuestInstance {
  id: string;
  user_id: string;
  daily_log_id: string;
  template_id: string | null;
  name: string;
  completion_type: CompletionType;
  target_value: number | null;
  actual_value: number;
  primary_stat: StatKind;
  base_xp: number;
  xp_awarded: number;
  is_required: boolean;
  is_penalty: boolean;
  completed: boolean;
  completed_at: string | null;
  timer_started_at: string | null;
}

export interface DailyLog {
  id: string;
  user_id: string;
  quest_date: string;
  status: DailyStatus;
  cleared_at: string | null;
  has_penalty_quest: boolean;
}

export const AllocationSchema = z.object({
  int: z.number().int().min(0),
  str: z.number().int().min(0),
  dis: z.number().int().min(0),
});
export type Allocation = z.infer<typeof AllocationSchema>;

export const TemplateInputSchema = z.object({
  name: z.string().min(1).max(80),
  completion_type: z.enum(COMPLETION_TYPES),
  target_value: z.number().int().positive().nullable(),
  primary_stat: z.enum(STATS),
  base_xp: z.number().int().min(0).max(1000),
  is_required: z.boolean(),
  sort_order: z.number().int().min(0),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;
