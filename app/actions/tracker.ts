'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWeekStart, localDateISO, yesterdayLocal, daysOfWeek } from '@/lib/time';
import { buildInstancesFromTemplate, computePartialXp, evaluateDailyClear } from '@/lib/quests';
import { toTrackerQuest, toTrackerProfile } from '@/lib/tracker/map';
import type { TrackerSnapshot } from '@/lib/tracker/types';
import type { Profile, QuestTemplate, QuestInstance, WeeklyQuestInstance, StatKind } from '@/lib/types';
import { decideStreak } from '@/lib/tracker/progress';
import { cloneTemplatesForNewWeek } from '@/lib/plan';
import { categoryXp } from '@/lib/tracker/locked-xp';
import { diffTemplates, type PlanRowInput } from '@/lib/tracker/plan-reconcile';
import { decideWeeklyLevelUp, xpToNext, titleForLevel } from '@/lib/xp';
import { computeWeeklyCompletion } from '@/lib/tracker/weekly';

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, userId: user.id };
}

export async function setUsername(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, userId } = await requireUser();
  const name = raw.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    return { ok: false, error: 'Use 3–20 letters, numbers, or underscores.' };
  }
  const { error } = await supabase.from('profile').update({ username: name }).eq('user_id', userId);
  if (error) {
    // unique violation -> taken
    if (error.code === '23505') return { ok: false, error: 'That username is taken.' };
    return { ok: false, error: 'Could not save username.' };
  }
  return { ok: true };
}

export async function getTodaySnapshot(): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();

  const { data: profileRow } = await supabase
    .from('profile').select('*').eq('user_id', userId).single();
  const profile = profileRow as Profile;

  const now = new Date();
  const tz = profile.timezone;
  const today = localDateISO(now, tz);
  const weekStart = getCurrentWeekStart(now, tz, profile.reset_hour_local);

  let { data: weekPlan } = await supabase
    .from('week_plan').select('id')
    .eq('user_id', userId).eq('week_start_date', weekStart).maybeSingle();

  if (!weekPlan) {
    const { data: created } = await supabase
      .from('week_plan').insert({ user_id: userId, week_start_date: weekStart })
      .select('id').single();
    weekPlan = created;
    const { data: prior } = await supabase
      .from('week_plan').select('id, week_start_date')
      .eq('user_id', userId).lt('week_start_date', weekStart)
      .order('week_start_date', { ascending: false }).limit(1).maybeSingle();
    if (prior) {
      // --- Weekly level-up evaluation for the prior week ---
      const { data: priorTemplateRows } = await supabase
        .from('quest_template').select('id, cadence')
        .eq('week_plan_id', prior.id).eq('active', true);
      const priorTemplates = (priorTemplateRows ?? []) as Array<{ id: string; cadence: string }>;
      const priorDailyTemplateCount = priorTemplates.filter((t) => t.cadence === 'daily').length;
      const priorWeeklyTemplateCount = priorTemplates.filter((t) => t.cadence === 'weekly').length;

      // Count completed daily quest instances for the prior week.
      const priorDays = daysOfWeek(prior.week_start_date);
      const { data: priorDailyLogRows } = await supabase
        .from('daily_log').select('id')
        .eq('user_id', userId).in('quest_date', priorDays);
      const priorDailyLogIds = (priorDailyLogRows ?? []).map((r: { id: string }) => r.id);
      let priorCompletedDaily = 0;
      if (priorDailyLogIds.length > 0) {
        const { count } = await supabase
          .from('quest_instance').select('id', { count: 'exact', head: true })
          .in('daily_log_id', priorDailyLogIds).eq('completed', true);
        priorCompletedDaily = count ?? 0;
      }

      // Count completed weekly quest instances for the prior week.
      const { data: priorWeeklyLogRow } = await supabase
        .from('weekly_log').select('id')
        .eq('user_id', userId).eq('week_start_date', prior.week_start_date).maybeSingle();
      let priorCompletedWeekly = 0;
      if (priorWeeklyLogRow) {
        const { count } = await supabase
          .from('weekly_quest_instance').select('id', { count: 'exact', head: true })
          .eq('weekly_log_id', priorWeeklyLogRow.id).eq('completed', true);
        priorCompletedWeekly = count ?? 0;
      }

      const priorPct = computeWeeklyCompletion({
        dailyTemplateCount: priorDailyTemplateCount,
        weeklyTemplateCount: priorWeeklyTemplateCount,
        completedDaily: priorCompletedDaily,
        completedWeekly: priorCompletedWeekly,
      });
      const decision = decideWeeklyLevelUp({ level: profile.level, completionPct: priorPct });
      if (decision.leveledUp) {
        const newLevel = decision.newLevel;
        const newXpToNext = xpToNext(newLevel);
        const newTitle = titleForLevel(newLevel);
        await supabase.from('profile').update({
          level: newLevel,
          xp_in_level: 0,
          xp_to_next: newXpToNext,
          title: newTitle,
        }).eq('user_id', userId);
        await supabase.from('level_up_event').insert({
          user_id: userId,
          from_level: profile.level,
          to_level: newLevel,
          points_granted: 0,
          title_unlocked: newTitle,
        });
        // Reflect new values into in-memory profile so snapshot shows updated level.
        profile.level = newLevel;
        profile.xp_in_level = 0;
        profile.xp_to_next = newXpToNext;
        profile.title = newTitle;
      }

      // --- Carry-forward: clone prior week's templates into the new week ---
      const { data: priorFullTemplates } = await supabase
        .from('quest_template').select('*')
        .eq('week_plan_id', prior.id).eq('active', true);
      const clones = cloneTemplatesForNewWeek((priorFullTemplates ?? []) as QuestTemplate[], weekPlan!.id, userId);
      if (clones.length) {
        await supabase.from('quest_template').insert(clones);
      }
    }
  }
  const { data: templateRows } = await supabase
    .from('quest_template').select('*')
    .eq('week_plan_id', weekPlan!.id).eq('active', true).order('sort_order');
  const templates = (templateRows ?? []) as QuestTemplate[];

  await supabase.from('daily_log')
    .upsert({ user_id: userId, quest_date: today }, { onConflict: 'user_id,quest_date', ignoreDuplicates: true });
  const { data: dailyLog } = await supabase
    .from('daily_log').select('id').eq('user_id', userId).eq('quest_date', today).single();

  const dailyTemplates = templates.filter((t) => t.cadence === 'daily');
  const dailyToInsert = buildInstancesFromTemplate(dailyTemplates, dailyLog!.id, userId)
    .map((row) => ({ ...row, base_xp: categoryXp((row as any).primary_stat) }));
  if (dailyToInsert.length) {
    await supabase.from('quest_instance')
      .upsert(dailyToInsert, { onConflict: 'daily_log_id,template_id', ignoreDuplicates: true });
  }

  await supabase.from('weekly_log')
    .upsert({ user_id: userId, week_start_date: weekStart }, { onConflict: 'user_id,week_start_date', ignoreDuplicates: true });
  const { data: weeklyLog } = await supabase
    .from('weekly_log').select('id').eq('user_id', userId).eq('week_start_date', weekStart).single();

  const weeklyTemplates = templates.filter((t) => t.cadence === 'weekly');
  const weeklyToInsert = weeklyTemplates.map((t) => ({
    user_id: userId, weekly_log_id: weeklyLog!.id, template_id: t.id, name: t.name,
    completion_type: t.completion_type, target_value: t.target_value, actual_value: 0,
    primary_stat: t.primary_stat, base_xp: categoryXp(t.primary_stat), xp_awarded: 0,
    completed: false, completed_at: null,
  }));
  if (weeklyToInsert.length) {
    await supabase.from('weekly_quest_instance')
      .upsert(weeklyToInsert, { onConflict: 'weekly_log_id,template_id', ignoreDuplicates: true });
  }

  const { data: dailyRows } = await supabase
    .from('quest_instance').select('*').eq('daily_log_id', dailyLog!.id);
  const { data: weeklyRows } = await supabase
    .from('weekly_quest_instance').select('*').eq('weekly_log_id', weeklyLog!.id);

  // --- Current-week completion percentage ---
  const currentDailyTemplateCount = dailyTemplates.length;
  const currentWeeklyTemplateCount = weeklyTemplates.length;

  // Count completed daily instances across all days of the current week.
  const currentWeekDays = daysOfWeek(weekStart);
  const { data: currentWeekDailyLogRows } = await supabase
    .from('daily_log').select('id')
    .eq('user_id', userId).in('quest_date', currentWeekDays);
  const currentDailyLogIds = (currentWeekDailyLogRows ?? []).map((r: { id: string }) => r.id);
  let currentCompletedDaily = 0;
  if (currentDailyLogIds.length > 0) {
    const { count } = await supabase
      .from('quest_instance').select('id', { count: 'exact', head: true })
      .in('daily_log_id', currentDailyLogIds).eq('completed', true);
    currentCompletedDaily = count ?? 0;
  }

  const currentCompletedWeekly = (weeklyRows ?? []).filter((r: { completed: boolean }) => r.completed).length;

  const weeklyTotal = currentDailyTemplateCount * 7 + currentWeeklyTemplateCount;
  const weeklyCompleted = currentCompletedDaily + currentCompletedWeekly;
  const weeklyCompletionPct = computeWeeklyCompletion({
    dailyTemplateCount: currentDailyTemplateCount,
    weeklyTemplateCount: currentWeeklyTemplateCount,
    completedDaily: currentCompletedDaily,
    completedWeekly: currentCompletedWeekly,
  });

  return {
    profile: toTrackerProfile(profile),
    dailyQuests: (dailyRows ?? []).map((r) => toTrackerQuest(r as any, 'daily')),
    weeklyQuests: (weeklyRows ?? []).map((r) => toTrackerQuest(r as any, 'weekly')),
    weekStart,
    today,
    weeklyCompletionPct,
    weeklyCompleted,
    weeklyTotal,
  };
}

const STAT_COL: Record<StatKind, 'stat_int' | 'stat_str' | 'stat_dis'> = {
  INT: 'stat_int', STR: 'stat_str', DIS: 'stat_dis',
};

export async function setQuestProgress(instanceId: string, actualValue: number): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('quest_instance').select('*').eq('id', instanceId).eq('user_id', userId).single();
  const i = inst as QuestInstance;
  const actual = Math.max(0, actualValue);

  await supabase.from('quest_instance')
    .update({
      actual_value: actual,
      xp_awarded: i.completed ? i.xp_awarded : computePartialXp({ actual, target: i.target_value, base_xp: i.base_xp }),
    })
    .eq('id', instanceId).eq('user_id', userId);

  const reached = i.target_value !== null && actual >= i.target_value;
  if (reached && !i.completed) return completeQuest(instanceId);
  if (!reached && i.completed) return uncompleteQuest(instanceId);
  return getTodaySnapshot();
}

export async function completeQuest(instanceId: string): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('quest_instance').select('*').eq('id', instanceId).eq('user_id', userId).single();
  const i = inst as QuestInstance;

  if (i.completed) return getTodaySnapshot();

  const { data: profileRow } = await supabase
    .from('profile').select('*').eq('user_id', userId).single();
  const p = profileRow as Profile;

  const xp = categoryXp(i.primary_stat);
  const statCol = STAT_COL[i.primary_stat];

  await supabase.from('quest_instance')
    .update({ completed: true, completed_at: new Date().toISOString(), xp_awarded: xp })
    .eq('id', instanceId).eq('user_id', userId).eq('completed', false);

  await supabase.from('profile').update({
    total_xp: p.total_xp + xp,
    xp_in_level: p.xp_in_level + xp,
    [statCol]: (p as any)[statCol] + xp,
  }).eq('user_id', userId);

  await maybeAdvanceStreak(supabase, userId, i.daily_log_id, p);
  return getTodaySnapshot();
}

export async function uncompleteQuest(instanceId: string): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  await supabase.from('quest_instance')
    .update({ completed: false, completed_at: null })
    .eq('id', instanceId).eq('user_id', userId);
  return getTodaySnapshot();
}

async function maybeAdvanceStreak(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string,
  dailyLogId: string,
  p: Profile,
) {
  const { data: rows } = await supabase
    .from('quest_instance').select('is_required, completed').eq('daily_log_id', dailyLogId);
  const clear = evaluateDailyClear(rows ?? []);
  if (clear.status !== 'cleared') return;

  const { data: log } = await supabase
    .from('daily_log').select('quest_date, status').eq('id', dailyLogId).single();
  if (log!.status === 'cleared') return;

  const { data: yLog } = await supabase
    .from('daily_log').select('status')
    .eq('user_id', userId).eq('quest_date', yesterdayLocal(log!.quest_date)).maybeSingle();
  const streak = decideStreak({
    current: p.streak_current, best: p.streak_best,
    yesterdayCleared: yLog?.status === 'cleared',
  });
  await supabase.from('daily_log')
    .update({ status: 'cleared', cleared_at: new Date().toISOString() }).eq('id', dailyLogId);
  await supabase.from('profile')
    .update({ streak_current: streak.current, streak_best: streak.best }).eq('user_id', userId);
}

export async function setWeeklyProgress(weeklyInstanceId: string, actualValue: number): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();
  const { data: inst } = await supabase
    .from('weekly_quest_instance').select('*').eq('id', weeklyInstanceId).eq('user_id', userId).single();
  const i = inst as WeeklyQuestInstance;
  const actual = Math.max(0, actualValue);
  const reached = i.target_value !== null && actual >= i.target_value;

  if (reached && !i.completed) {
    const { data: profileRow } = await supabase.from('profile').select('*').eq('user_id', userId).single();
    const p = profileRow as Profile;
    const xp = categoryXp(i.primary_stat);
    await supabase.from('weekly_quest_instance').update({
      actual_value: actual, completed: true, completed_at: new Date().toISOString(), xp_awarded: xp,
    }).eq('id', weeklyInstanceId).eq('user_id', userId).eq('completed', false);
    await supabase.from('profile').update({
      total_xp: p.total_xp + xp,
      xp_in_level: p.xp_in_level + xp,
      stat_dis: p.stat_dis + xp,
    }).eq('user_id', userId);
  } else {
    await supabase.from('weekly_quest_instance').update({ actual_value: actual }).eq('id', weeklyInstanceId).eq('user_id', userId);
  }
  return getTodaySnapshot();
}

export interface LeaderboardEntry { username: string; level: number; totalXp: number; rank: number; }
export interface LeaderboardView { entries: LeaderboardEntry[]; myUsername: string | null; optedIn: boolean; }

export async function getLeaderboard(): Promise<LeaderboardView> {
  const { supabase, userId } = await requireUser();
  const { data: me } = await supabase
    .from('profile').select('username, leaderboard_opt_in').eq('user_id', userId).single();
  const { data: rows } = await supabase.rpc('get_leaderboard');
  const entries: LeaderboardEntry[] = (rows ?? []).map((r: any) => ({
    username: r.username, level: r.level, totalXp: Number(r.total_xp), rank: Number(r.rank),
  }));
  return { entries, myUsername: me?.username ?? null, optedIn: !!me?.leaderboard_opt_in };
}

export async function joinLeaderboard(): Promise<LeaderboardView> {
  const { supabase, userId } = await requireUser();
  await supabase.from('profile').update({ leaderboard_opt_in: true }).eq('user_id', userId);
  return getLeaderboard();
}

export async function leaveLeaderboard(): Promise<LeaderboardView> {
  const { supabase, userId } = await requireUser();
  await supabase.from('profile').update({ leaderboard_opt_in: false }).eq('user_id', userId);
  return getLeaderboard();
}

export async function planWeek(rows: PlanRowInput[]): Promise<TrackerSnapshot> {
  const { supabase, userId } = await requireUser();

  // Resolve current week's week_plan. getTodaySnapshot creates it if missing,
  // so fetch first and fall back to a materialize-then-refetch if absent.
  const snap = await getTodaySnapshot();
  const { weekStart, today } = snap;
  let { data: weekPlan } = await supabase
    .from('week_plan').select('id')
    .eq('user_id', userId).eq('week_start_date', weekStart).maybeSingle();
  if (!weekPlan) {
    await getTodaySnapshot();
    const refetch = await supabase
      .from('week_plan').select('id')
      .eq('user_id', userId).eq('week_start_date', weekStart).single();
    weekPlan = refetch.data;
  }
  const weekPlanId = weekPlan!.id;

  // 1. Fixed category XP per desired row (client base_xp is ignored entirely).
  const desired = rows.map((r) => ({
    row: r,
    base_xp: categoryXp(r.primary_stat),
  }));

  // 2. Load existing ACTIVE templates and diff against the desired plan.
  const { data: activeRows } = await supabase
    .from('quest_template').select('*')
    .eq('week_plan_id', weekPlanId).eq('user_id', userId).eq('active', true);
  const existingActive = (activeRows ?? []) as QuestTemplate[];
  const existingActiveIds = existingActive.map((t) => t.id);
  const diff = diffTemplates(existingActiveIds, rows);

  // 3a. Update kept templates in place.
  for (const id of diff.toUpdateIds) {
    const d = desired.find((x) => x.row.id === id);
    if (!d) continue;
    await supabase.from('quest_template').update({
      name: d.row.name,
      completion_type: d.row.completion_type,
      target_value: d.row.target_value,
      primary_stat: d.row.primary_stat,
      base_xp: d.base_xp,
      is_required: d.row.is_required,
      sort_order: d.row.sort_order,
      cadence: d.row.cadence,
      active: true,
    }).eq('id', id).eq('user_id', userId);
  }

  // 3b. Insert brand-new templates.
  const insertRows = diff.toInsert.map((r) => ({
    user_id: userId, week_plan_id: weekPlanId, name: r.name,
    completion_type: r.completion_type, target_value: r.target_value,
    primary_stat: r.primary_stat, base_xp: categoryXp(r.primary_stat), is_required: r.is_required,
    sort_order: r.sort_order, active: true, cadence: r.cadence,
  }));
  if (insertRows.length) {
    await supabase.from('quest_template').insert(insertRows);
  }

  // 3c. Deactivate removed templates.
  if (diff.toDeactivateIds.length) {
    await supabase.from('quest_template').update({ active: false })
      .in('id', diff.toDeactivateIds).eq('user_id', userId);
  }

  // 4. Re-read the now-current active templates for instance reconciliation.
  const { data: postRows } = await supabase
    .from('quest_template').select('*')
    .eq('week_plan_id', weekPlanId).eq('user_id', userId).eq('active', true).order('sort_order');
  const post = (postRows ?? []) as QuestTemplate[];
  const dailyTemplates = post.filter((t) => t.cadence === 'daily');
  const weeklyTemplates = post.filter((t) => t.cadence === 'weekly');

  // 5. Reconcile today's daily_log instances.
  const { data: dailyLog } = await supabase
    .from('daily_log').select('id').eq('user_id', userId).eq('quest_date', today).single();
  if (dailyLog) {
    const { data: instRows } = await supabase
      .from('quest_instance').select('*').eq('daily_log_id', dailyLog.id).eq('user_id', userId);
    const instances = (instRows ?? []) as QuestInstance[];
    const activeDailyIds = new Set(dailyTemplates.map((t) => t.id));
    const byTemplateId = new Map(
      instances.filter((i) => i.template_id !== null).map((i) => [i.template_id as string, i]),
    );

    for (const t of dailyTemplates) {
      const inst = byTemplateId.get(t.id);
      if (!inst) {
        await supabase.from('quest_instance').insert({
          user_id: userId, daily_log_id: dailyLog.id, template_id: t.id, name: t.name,
          completion_type: t.completion_type, target_value: t.target_value, actual_value: 0,
          primary_stat: t.primary_stat, base_xp: categoryXp(t.primary_stat), xp_awarded: 0,
          is_required: t.is_required, is_penalty: false, completed: false,
          completed_at: null, timer_started_at: null,
        });
      } else if (!inst.completed) {
        await supabase.from('quest_instance').update({
          name: t.name, completion_type: t.completion_type, target_value: t.target_value,
          base_xp: categoryXp(t.primary_stat), primary_stat: t.primary_stat, is_required: t.is_required,
        }).eq('id', inst.id).eq('user_id', userId);
      }
      // completed instances are left untouched (earned XP preserved).
    }

    // Delete incomplete, non-penalty instances whose template is gone/null.
    const toDelete = instances.filter(
      (i) => !i.completed && !i.is_penalty &&
        (i.template_id === null || !activeDailyIds.has(i.template_id)),
    );
    for (const i of toDelete) {
      await supabase.from('quest_instance').delete().eq('id', i.id).eq('user_id', userId);
    }
  }

  // 5b. Reconcile current week's weekly_quest_instance rows.
  const { data: weeklyLog } = await supabase
    .from('weekly_log').select('id').eq('user_id', userId).eq('week_start_date', weekStart).single();
  if (weeklyLog) {
    const { data: wInstRows } = await supabase
      .from('weekly_quest_instance').select('*').eq('weekly_log_id', weeklyLog.id).eq('user_id', userId);
    const wInstances = (wInstRows ?? []) as WeeklyQuestInstance[];
    const activeWeeklyIds = new Set(weeklyTemplates.map((t) => t.id));
    const wByTemplateId = new Map(
      wInstances.filter((i) => i.template_id !== null).map((i) => [i.template_id as string, i]),
    );

    for (const t of weeklyTemplates) {
      const inst = wByTemplateId.get(t.id);
      if (!inst) {
        await supabase.from('weekly_quest_instance').insert({
          user_id: userId, weekly_log_id: weeklyLog.id, template_id: t.id, name: t.name,
          completion_type: t.completion_type, target_value: t.target_value, actual_value: 0,
          primary_stat: t.primary_stat, base_xp: categoryXp(t.primary_stat), xp_awarded: 0,
          completed: false, completed_at: null,
        });
      } else if (!inst.completed) {
        await supabase.from('weekly_quest_instance').update({
          name: t.name, completion_type: t.completion_type, target_value: t.target_value,
          base_xp: categoryXp(t.primary_stat), primary_stat: t.primary_stat,
        }).eq('id', inst.id).eq('user_id', userId);
      }
    }

    const wToDelete = wInstances.filter(
      (i) => !i.completed && (i.template_id === null || !activeWeeklyIds.has(i.template_id)),
    );
    for (const i of wToDelete) {
      await supabase.from('weekly_quest_instance').delete().eq('id', i.id).eq('user_id', userId);
    }
  }

  return getTodaySnapshot();
}
