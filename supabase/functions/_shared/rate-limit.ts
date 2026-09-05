import { createClient } from 'jsr:@supabase/supabase-js@2';

function clientFingerprint(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 240);
  return `${ip}|${userAgent}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function consumeRateLimit(options: {
  req: Request;
  action: string;
  entity?: string;
  limit: number;
  windowSeconds: number;
}): Promise<boolean> {
  const keyHash = await sha256(`${clientFingerprint(options.req)}|${options.entity || ''}`);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await admin.rpc('consume_edge_rate_limit', {
    p_action: options.action,
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) {
    console.error('[rate-limit] check failed', { action: options.action, code: error.code });
    return false;
  }
  return data === true;
}

export function redactPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return 'redacted';
  return `***${digits.slice(-4)}`;
}
