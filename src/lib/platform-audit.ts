import { supabase } from '@/integrations/supabase/client';

export async function logPlatformAction(action: string, details: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from('platform_audit_log').insert({
    action,
    details,
    performed_by: data.user.id,
    performed_by_email: data.user.email ?? null,
  });
  if (error) console.warn('[platform-audit] insert failed', { action, code: error.code });
}
