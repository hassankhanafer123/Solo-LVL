import { createClient } from '@supabase/supabase-js';

/** Server-only client using the service role key. Bypasses RLS — never import into client components. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
