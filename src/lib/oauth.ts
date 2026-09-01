// Social sign-in through Supabase Auth only.
//
// The provider must be configured in the Supabase project's Auth settings, and
// the callback URLs must be allow-listed there (site URL + redirect URLs).
import { supabase } from '@/integrations/supabase/client';

export type OAuthProvider = 'google' | 'apple' | 'azure';

export type OAuthResult = {
  redirected?: boolean;
  error?: Error | null;
};

export async function signInWithOAuth(
  provider: OAuthProvider,
  opts?: { redirectTo?: string; queryParams?: Record<string, string> },
): Promise<OAuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo:
        opts?.redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined),
      queryParams: opts?.queryParams,
    },
  });

  if (error) return { error };
  // Supabase navigates the browser to the provider.
  return { redirected: true };
}
