import type { QuestTemplate, TemplateInput } from './types';

/**
 * Given last week's templates and the new week_plan_id, produce the rows to
 * insert for the new week. Pure function — DB I/O lives in the server action.
 *
 * We strip the per-week identifying fields (id, week_plan_id) and reset
 * mutable ones (active=true). Sort order preserved so the user sees the same
 * order they last left their plan in.
 */
export function cloneTemplatesForNewWeek(
  prevTemplates: QuestTemplate[],
  newWeekPlanId: string,
  newUserId: string,
): Array<Omit<QuestTemplate, 'id'>> {
  return prevTemplates.map((t) => ({
    user_id: newUserId,
    week_plan_id: newWeekPlanId,
    name: t.name,
    completion_type: t.completion_type,
    target_value: t.target_value,
    primary_stat: t.primary_stat,
    base_xp: t.base_xp,
    is_required: t.is_required,
    sort_order: t.sort_order,
    active: true,
    cadence: t.cadence,
  }));
}

/** Validate a single template input row before insert/update. */
export function templateInputToRow(
  input: TemplateInput,
  weekPlanId: string,
  userId: string,
): Omit<QuestTemplate, 'id'> {
  return {
    user_id: userId,
    week_plan_id: weekPlanId,
    name: input.name,
    completion_type: input.completion_type,
    target_value: input.target_value,
    primary_stat: input.primary_stat,
    base_xp: input.base_xp,
    is_required: input.is_required,
    sort_order: input.sort_order,
    active: true,
    cadence: input.cadence,
  };
}
