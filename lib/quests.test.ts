import { describe, it, expect } from 'vitest';
import {
  buildInstancesFromTemplate,
  computePartialXp,
  pickPenaltyTarget,
  evaluateDailyClear,
  buildPenaltyInstance,
} from './quests';
import type { QuestTemplate, QuestInstance } from './types';

const tmpl = (over: Partial<QuestTemplate> = {}): QuestTemplate => ({
  id: 't1',
  user_id: 'u1',
  week_plan_id: 'wp1',
  name: 'Push-ups',
  completion_type: 'count',
  target_value: 100,
  primary_stat: 'STR',
  base_xp: 50,
  is_required: true,
  sort_order: 1,
  active: true,
  cadence: 'daily',
  ...over,
});

const inst = (over: Partial<QuestInstance> = {}): QuestInstance => ({
  id: 'i1',
  user_id: 'u1',
  daily_log_id: 'd1',
  template_id: 't1',
  name: 'Push-ups',
  completion_type: 'count',
  target_value: 100,
  actual_value: 0,
  primary_stat: 'STR',
  base_xp: 50,
  xp_awarded: 0,
  is_required: true,
  is_penalty: false,
  completed: false,
  completed_at: null,
  timer_started_at: null,
  ...over,
});

describe('buildInstancesFromTemplate', () => {
  it('snapshots template fields onto instance', () => {
    const t = tmpl();
    const out = buildInstancesFromTemplate([t], 'd1', 'u1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      user_id: 'u1',
      daily_log_id: 'd1',
      template_id: 't1',
      name: 'Push-ups',
      target_value: 100,
      base_xp: 50,
      is_required: true,
      is_penalty: false,
      completed: false,
      actual_value: 0,
    });
  });
  it('skips inactive templates', () => {
    const out = buildInstancesFromTemplate([tmpl({ active: false })], 'd1', 'u1');
    expect(out).toHaveLength(0);
  });
  it('preserves sort order', () => {
    const out = buildInstancesFromTemplate(
      [tmpl({ id: 'a', sort_order: 2 }), tmpl({ id: 'b', sort_order: 1 })],
      'd1',
      'u1'
    );
    expect(out[0]?.template_id).toBe('b');
    expect(out[1]?.template_id).toBe('a');
  });
});

describe('computePartialXp', () => {
  it('returns full xp when actual >= target', () => {
    expect(computePartialXp({ actual: 100, target: 100, base_xp: 50 })).toBe(50);
    expect(computePartialXp({ actual: 120, target: 100, base_xp: 50 })).toBe(50);
  });
  it('returns proportional xp when actual < target', () => {
    expect(computePartialXp({ actual: 50, target: 100, base_xp: 50 })).toBe(25);
    expect(computePartialXp({ actual: 33, target: 100, base_xp: 50 })).toBe(16); // floor
  });
  it('returns 0 when actual is 0', () => {
    expect(computePartialXp({ actual: 0, target: 100, base_xp: 50 })).toBe(0);
  });
  it('handles checkbox (target null) — full xp if actual >= 1', () => {
    expect(computePartialXp({ actual: 1, target: null, base_xp: 25 })).toBe(25);
    expect(computePartialXp({ actual: 0, target: null, base_xp: 25 })).toBe(0);
  });
});

describe('pickPenaltyTarget', () => {
  it('chooses among required, active templates', () => {
    const ts = [
      tmpl({ id: 'a', is_required: true }),
      tmpl({ id: 'b', is_required: false }),
      tmpl({ id: 'c', is_required: true }),
    ];
    const picked = pickPenaltyTarget(ts, () => 0);
    expect(['a', 'c']).toContain(picked!.id);
  });
  it('returns null if no required templates', () => {
    expect(pickPenaltyTarget([tmpl({ is_required: false })], () => 0)).toBeNull();
  });
  it('uses rng to pick deterministically', () => {
    const ts = [tmpl({ id: 'a' }), tmpl({ id: 'b' }), tmpl({ id: 'c' })];
    expect(pickPenaltyTarget(ts, () => 0)!.id).toBe('a');
    expect(pickPenaltyTarget(ts, () => 0.5)!.id).toBe('b');
    expect(pickPenaltyTarget(ts, () => 0.99)!.id).toBe('c');
  });
});

describe('buildPenaltyInstance', () => {
  it('multiplies target by 1.5 for count/timer', () => {
    const p = buildPenaltyInstance(tmpl({ target_value: 100 }), 'd1', 'u1');
    expect(p.target_value).toBe(150);
    expect(p.is_penalty).toBe(true);
    expect(p.is_required).toBe(true);
    expect(p.template_id).toBeNull(); // not linked to original template
    expect(p.name).toBe('Push-ups (Penalty +50%)');
  });
  it('keeps target null for checkbox', () => {
    const p = buildPenaltyInstance(
      tmpl({ completion_type: 'checkbox', target_value: null }),
      'd1',
      'u1'
    );
    expect(p.target_value).toBeNull();
  });
});

describe('evaluateDailyClear', () => {
  it('returns cleared when all required quests done', () => {
    const r = evaluateDailyClear([
      inst({ is_required: true, completed: true }),
      inst({ is_required: false, completed: false }),
    ]);
    expect(r.status).toBe('cleared');
    expect(r.required_remaining).toBe(0);
  });
  it('returns pending when some required incomplete', () => {
    const r = evaluateDailyClear([
      inst({ is_required: true, completed: true }),
      inst({ is_required: true, completed: false }),
    ]);
    expect(r.status).toBe('pending');
    expect(r.required_remaining).toBe(1);
  });
  it('handles empty list as cleared (vacuously)', () => {
    const r = evaluateDailyClear([]);
    expect(r.status).toBe('cleared');
    expect(r.required_remaining).toBe(0);
  });
});
