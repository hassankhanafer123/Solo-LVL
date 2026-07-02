import { describe, it, expect, beforeEach } from 'vitest';
import { createDemoApi, DEMO_STORAGE_KEY } from './demo-api';

beforeEach(() => localStorage.clear());

describe('demo-api', () => {
  it('completeQuest (checkbox) awards xp and persists', async () => {
    const api = createDemoApi();
    const before = (await api.getSnapshot()).profile.totalXp;
    const snap = await api.completeQuest('d-nophone'); // checkbox, was incomplete, baseXp 25
    expect(snap.dailyQuests.find((q) => q.instanceId === 'd-nophone')!.completed).toBe(true);
    expect(snap.profile.totalXp).toBe(before + 25);
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toContain('d-nophone');
  });

  it('uncompleteQuest reverts exactly', async () => {
    const api = createDemoApi();
    const base = (await api.getSnapshot()).profile.totalXp;
    await api.completeQuest('d-nophone');
    const reverted = await api.uncompleteQuest('d-nophone');
    expect(reverted.profile.totalXp).toBe(base);
  });

  it('planWeek rebuilds quests with locked xp', async () => {
    const api = createDemoApi();
    const snap = await api.planWeek([
      { id: null, name: 'New checkbox', completion_type: 'checkbox', target_value: null, primary_stat: 'INT', is_required: true, cadence: 'daily', sort_order: 0 },
      { id: null, name: 'Weekly gym', completion_type: 'count', target_value: 4, primary_stat: 'DIS', is_required: true, cadence: 'weekly', sort_order: 1 },
    ]);
    expect(snap.dailyQuests).toHaveLength(1);
    expect(snap.dailyQuests[0]!.baseXp).toBe(25);
    expect(snap.weeklyQuests).toHaveLength(1);
    expect(snap.weeklyQuests[0]!.baseXp).toBe(Math.round(Math.max(15, Math.round(4 * 0.5)) * 1.5));
  });

  it('reset restores the seed', async () => {
    const api = createDemoApi();
    await api.completeQuest('d-pushups');
    const fresh = api.reset();
    expect(fresh.dailyQuests.find((q) => q.instanceId === 'd-pushups')!.completed).toBe(false);
  });

  it('corrupt storage reseeds instead of throwing', async () => {
    localStorage.setItem(DEMO_STORAGE_KEY, '{not json');
    const api = createDemoApi();
    const snap = await api.getSnapshot();
    expect(snap.dailyQuests.length).toBeGreaterThan(0);
  });
});
