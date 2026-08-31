// Supabase browser client.
// No hardcoded project fallback: the app must be configured entirely through
// environment variables so it can never silently connect to another backend.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const SUPABASE_PUBLISHABLE_KEY = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

if (!isSupabaseConfigured) {
  const missing = [
    !SUPABASE_URL && 'VITE_SUPABASE_URL',
    !SUPABASE_PUBLISHABLE_KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `Supabase is not configured: missing ${missing}. Set these environment variables in your deployment (and local .env) before building the app.`,
  );
}

const _client = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!);
export const supabase: any = _client;

