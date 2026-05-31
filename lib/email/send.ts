import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM || 'DayMaxing <onboarding@resend.dev>';

// Lazily constructed so importing this module (e.g. during Next.js build-time
// page-data collection) doesn't require RESEND_API_KEY to be present.
let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(args: { to: string; subject: string; html: string }) {
  return resend().emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
}
