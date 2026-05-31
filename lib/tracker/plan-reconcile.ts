import type { StatKind, CompletionType, Cadence } from '../types';

export interface PlanRowInput {
  id: string | null; // existing quest_template id, or null for a new task
  name: string;
  completion_type: CompletionType;
  target_value: number | null;
  primary_stat: StatKind;
  is_required: boolean;
  cadence: Cadence;
  sort_order: number;
}

export interface ExistingTemplate {
  id: string;
}

export interface TemplateDiff {
  toInsert: PlanRowInput[]; // rows with id === null
  toUpdateIds: string[]; // ids present in both existing(active) and desired
  toDeactivateIds: string[]; // existing active ids NOT present in desired
}

/**
 * Pure diff between the currently-active template ids and the desired plan rows.
 *
 * - toInsert: desired rows with id === null (brand new tasks)
 * - toUpdateIds: intersection(existingActiveIds, desiredIds) — kept & edited in place
 * - toDeactivateIds: existing active ids absent from the desired set
 *
 * Desired rows carrying an id not in existingActiveIds are stale and ignored
 * (not inserted, not updated).
 */
export function diffTemplates(existingActiveIds: string[], desired: PlanRowInput[]): TemplateDiff {
  const toInsert = desired.filter((r) => r.id === null);
  const desiredIds = new Set(desired.filter((r) => r.id !== null).map((r) => r.id as string));
  const toUpdateIds = existingActiveIds.filter((id) => desiredIds.has(id));
  const toDeactivateIds = existingActiveIds.filter((id) => !desiredIds.has(id));
  return { toInsert, toUpdateIds, toDeactivateIds };
}
