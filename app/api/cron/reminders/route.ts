import { createAdminClient } from '@/lib/supabase/admin';
import { reminderDue } from '@/lib/email/due';
import { sendEmail } from '@/lib/email/send';
import { morningEmailHtml, weeklyEmailHtml, type MorningTask } from '@/lib/email/templates';
import type { StatKind } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ProfileRow {
  user_id: string;
  username: string | null;
  timezone: string;
  email_send_hour_local: number;
  reset_hour_local: number;
  email_enabled: boolean;
  email_target: string | null;
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  const qp = new URL(request.url).searchParams.get('secret');
  return qp === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  // Map userId -> auth email. One page is fine for v1 (see pagination note).
  const usersMap: Record<string, string | undefined> = {};
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  for (const u of users) usersMap[u.id] = u.email ?? undefined;

  const { data: profileData } = await admin
    .from('profile')
    .select(
      'user_id, username, timezone, email_send_hour_local, reset_hour_local, email_enabled, email_target',
    );
  const profiles = (profileData ?? []) as ProfileRow[];

  const now = new Date();
  let dailySent = 0;
  let weeklySent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of profiles) {
    const due = reminderDue({
      now,
      timezone: p.timezone,
      sendHour: p.email_send_hour_local,
      resetHour: p.reset_hour_local,
      emailEnabled: p.email_enabled,
    });

    if (!due.daily && !due.weekly) {
      skipped++;
      continue;
    }

    const recipient = p.email_target ?? usersMap[p.user_id];
    if (!recipient) {
      skipped++;
      continue;
    }

    const username = p.username ?? 'Hunter';

    // --- Daily morning reminder ---
    if (due.daily) {
      const { data: existing } = await admin
        .from('email_log')
        .select('id')
        .eq('user_id', p.user_id)
        .eq('quest_date', due.localDate)
        .eq('kind', 'daily')
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        let status: 'sent' | 'failed' = 'sent';
        let error: string | null = null;
        try {
          const tasks = await todaysDailyTasks(admin, p.user_id, due.weekStart);
          const html = await morningEmailHtml({ username, tasks, appUrl });
          const res = await sendEmail({
            to: recipient,
            subject: `Good morning, ${username} — today's run`,
            html,
          });
          if (res.error) {
            status = 'failed';
            error = res.error.message;
          }
        } catch (e) {
          status = 'failed';
          error = e instanceof Error ? e.message : String(e);
        }
        if (status === 'sent') dailySent++;
        else errors.push(`daily:${p.user_id}:${error}`);
        await admin.from('email_log').insert({
          user_id: p.user_id,
          quest_date: due.localDate,
          kind: 'daily',
          status,
          error,
        });
      }
    }

    // --- Weekly plan reminder (local Monday) ---
    if (due.weekly) {
      const { data: existing } = await admin
        .from('email_log')
        .select('id')
        .eq('user_id', p.user_id)
        .eq('quest_date', due.localDate)
        .eq('kind', 'weekly')
        .maybeSingle();

      if (existing) {
        skipped++;
      } else {
        let status: 'sent' | 'failed' = 'sent';
        let error: string | null = null;
        try {
          const html = await weeklyEmailHtml({ username, appUrl });
          const res = await sendEmail({
            to: recipient,
            subject: 'Plan your week on DayMaxing',
            html,
          });
          if (res.error) {
            status = 'failed';
            error = res.error.message;
          }
        } catch (e) {
          status = 'failed';
          error = e instanceof Error ? e.message : String(e);
        }
        if (status === 'sent') weeklySent++;
        else errors.push(`weekly:${p.user_id}:${error}`);
        await admin.from('email_log').insert({
          user_id: p.user_id,
          quest_date: due.localDate,
          kind: 'weekly',
          status,
          error,
        });
      }
    }
  }

  return Response.json({ dailySent, weeklySent, skipped, errors });
}

/**
 * Active daily quest_template names for the user's current week_plan.
 * Returns [] if the user has no plan for this week yet.
 */
async function todaysDailyTasks(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  weekStart: string,
): Promise<MorningTask[]> {
  const { data: weekPlan } = await admin
    .from('week_plan')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start_date', weekStart)
    .maybeSingle();
  if (!weekPlan) return [];

  const { data: templates } = await admin
    .from('quest_template')
    .select('name, primary_stat')
    .eq('week_plan_id', weekPlan.id)
    .eq('active', true)
    .eq('cadence', 'daily')
    .order('sort_order');

  return ((templates ?? []) as Array<{ name: string; primary_stat: StatKind }>).map(
    (t) => ({ name: t.name, stat: t.primary_stat }),
  );
}
