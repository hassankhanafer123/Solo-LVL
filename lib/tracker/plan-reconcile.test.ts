import { describe, it, expect } from 'vitest';
import { diffTemplates, type PlanRowInput } from './plan-reconcile';

function row(id: string | null, name = 'q'): PlanRowInput {
  return {
    id,
    name,
    completion_type: 'checkbox',
    target_value: null,
    primary_stat: 'INT',
    is_required: true,
    cadence: 'daily',
    sort_order: 0,
  };
}

describe('diffTemplates', () => {
  it('all-new rows -> insert only', () => {
    const d = diffTemplates([], [row(null), row(null)]);
    expect(d.toInsert).toHaveLength(2);
    expect(d.toUpdateIds).toEqual([]);
    expect(d.toDeactivateIds).toEqual([]);
  });

  it('rename existing -> update', () => {
    const d = diffTemplates(['a'], [row('a', 'renamed')]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdateIds).toEqual(['a']);
    expect(d.toDeactivateIds).toEqual([]);
  });

  it('remove one -> deactivate', () => {
    const d = diffTemplates(['a', 'b'], [row('a')]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdateIds).toEqual(['a']);
    expect(d.toDeactivateIds).toEqual(['b']);
  });

  it('mix of insert, update, deactivate', () => {
    const d = diffTemplates(['a', 'b'], [row('a'), row(null), row(null)]);
    expect(d.toInsert).toHaveLength(2);
    expect(d.toUpdateIds).toEqual(['a']);
    expect(d.toDeactivateIds).toEqual(['b']);
  });

  it('stale desired id not in existing-active is ignored (not updated, not inserted)', () => {
    const d = diffTemplates(['a'], [row('a'), row('ghost')]);
    expect(d.toInsert).toEqual([]);
    expect(d.toUpdateIds).toEqual(['a']);
    expect(d.toDeactivateIds).toEqual([]);
  });
});
