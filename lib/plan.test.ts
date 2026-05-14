import { describe, it, expect } from 'vitest';
import { cloneTemplatesForNewWeek, templateInputToRow } from './plan';
import type { QuestTemplate } from './types';

const baseTemplate: QuestTemplate = {
  id: 'old-id-1',
  user_id: 'user-1',
  week_plan_id: 'old-week',
  name: 'Study',
  completion_type: 'timer',
  target_value: 90,
  primary_stat: 'INT',
  base_xp: 75,
  is_required: true,
  sort_order: 1,
  active: true,
  cadence: 'daily',
};

describe('cloneTemplatesForNewWeek', () => {
  it('strips id and rewires week_plan_id + user_id', () => {
    const out = cloneTemplatesForNewWeek([baseTemplate], 'new-week', 'user-1');
    expect(out).toHaveLength(1);
    expect(out[0]!).not.toHaveProperty('id');
    expect(out[0]!.week_plan_id).toBe('new-week');
    expect(out[0]!.user_id).toBe('user-1');
  });

  it('preserves name, cadence, target_value, sort_order', () => {
    const out = cloneTemplatesForNewWeek([baseTemplate], 'new-week', 'user-1');
    expect(out[0]!.name).toBe('Study');
    expect(out[0]!.cadence).toBe('daily');
    expect(out[0]!.target_value).toBe(90);
    expect(out[0]!.sort_order).toBe(1);
  });

  it('resets active=true regardless of prior state', () => {
    const inactive = { ...baseTemplate, active: false };
    const out = cloneTemplatesForNewWeek([inactive], 'new-week', 'user-1');
    expect(out[0]!.active).toBe(true);
  });

  it('clones weekly DIS templates with full cadence preserved', () => {
    const weekly: QuestTemplate = {
      ...baseTemplate,
      id: 'old-id-2',
      name: 'Meditate',
      cadence: 'weekly',
      primary_stat: 'DIS',
      target_value: 70,
    };
    const out = cloneTemplatesForNewWeek([weekly], 'new-week', 'user-1');
    expect(out[0]!.cadence).toBe('weekly');
    expect(out[0]!.target_value).toBe(70);
  });

  it('returns empty array given empty input', () => {
    expect(cloneTemplatesForNewWeek([], 'new-week', 'user-1')).toEqual([]);
  });
});

describe('templateInputToRow', () => {
  it('shapes a TemplateInput into an insertable row', () => {
    const row = templateInputToRow(
      {
        name: 'New quest',
        completion_type: 'count',
        target_value: 50,
        primary_stat: 'STR',
        base_xp: 25,
        is_required: false,
        sort_order: 5,
        cadence: 'daily',
      },
      'wp-1',
      'user-1',
    );
    expect(row.week_plan_id).toBe('wp-1');
    expect(row.user_id).toBe('user-1');
    expect(row.active).toBe(true);
    expect(row.name).toBe('New quest');
  });
});
