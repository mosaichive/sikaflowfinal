import { supabase } from '@/integrations/supabase/client';

export const REQUIRED_REFERRAL_COLUMNS = [
  'referred_email',
  'reward_months',
  'referrer_business_id',
] as const;

const SESSION_KEY = 'kuditrack.referrals.schema.checked';

let inFlight: Promise<void> | null = null;

/** Columns that are missing from public.referrals right now (empty when healthy). */
export async function findMissingReferralColumns(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_table_columns', { _table_name: 'referrals' });
  if (error) throw error;
  const present = new Set(((data ?? []) as { column_name: string }[]).map((row) => row.column_name));
  return REQUIRED_REFERRAL_COLUMNS.filter((column) => !present.has(column));
}

/**
 * Startup check: verifies the referral columns the app and edge functions depend on exist,
 * and asks the backend to run the additive (non-destructive) migration when any are missing.
 * Runs at most once per browser session and never throws.
 */
export async function ensureReferralsSchema(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!force && sessionStorage.getItem(SESSION_KEY) === '1') return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      const missing = await findMissingReferralColumns();
      if (missing.length === 0) {
        sessionStorage.setItem(SESSION_KEY, '1');
        return;
      }

      console.warn('[referrals] missing columns, running additive migration:', missing);
      const { data, error } = await supabase.functions.invoke('referrals-schema-check');
      if (error) throw error;

      const stillMissing = await findMissingReferralColumns();
      if (stillMissing.length > 0) {
        console.error('[referrals] columns still missing after migration:', stillMissing, data);
        return;
      }

      console.info('[referrals] schema repaired:', data);
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (error) {
      console.error('[referrals] schema check failed', error);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
