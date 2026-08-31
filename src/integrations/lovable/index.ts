// OAuth entry point for the app.
//
// Two providers are supported, selected by the build-time env var
// `VITE_AUTH_PROVIDER`:
//
//   "supabase" (default when unset in a non-Lovable build) -> native
//       supabase.auth.signInWithOAuth. This is the cutover path: it depends
//       only on the external Supabase project's own Auth configuration and
//       requires no Lovable package, key or service.
//
//   "lovable" -> the legacy Lovable-brokered OAuth flow, kept ONLY so the
//       current Lovable Cloud deployment keeps working unchanged until
//       cutover. The package is imported lazily so a build that does not use
//       it never pulls it into the bundle.
//
// The public shape (`lovable.auth.signInWithOAuth`) is unchanged, so no page
// needs to be edited at cutover — flipping the env var is enough.
import { supabase } from '../supabase/client';

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SignInResult = {
  redirected?: boolean;
  error?: Error | null;
  tokens?: unknown;
};

const RAW_PROVIDER = (import.meta.env.VITE_AUTH_PROVIDER as string | undefined)?.trim().toLowerCase();

// On Lovable Cloud previews the legacy broker is still the active path.
// Anywhere else (self-hosted / Vercel) the default is native Supabase Auth.
const IS_LOVABLE_HOST =
  typeof window !== 'undefined' && /\.lovable(project)?\.app$/.test(window.location.hostname);

export const authProvider: 'supabase' | 'lovable' =
  RAW_PROVIDER === 'lovable' ? 'lovable' : RAW_PROVIDER === 'supabase' ? 'supabase' : IS_LOVABLE_HOST ? 'lovable' : 'supabase';

async function signInWithLovable(
  provider: 'google' | 'apple' | 'microsoft' | 'lovable',
  opts?: SignInOptions,
): Promise<SignInResult> {
  const { createLovableAuth } = await import('@lovable.dev/cloud-auth-js');
  const lovableAuth = createLovableAuth();
  const result = await lovableAuth.signInWithOAuth(provider, {
    redirect_uri: opts?.redirect_uri,
    extraParams: { ...opts?.extraParams },
  });

  if (result.redirected || result.error) return result as SignInResult;

  try {
    await supabase.auth.setSession((result as SignInResult).tokens);
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
  return result as SignInResult;
}

async function signInWithSupabase(
  provider: 'google' | 'apple' | 'microsoft' | 'lovable',
  opts?: SignInOptions,
): Promise<SignInResult> {
  if (provider === 'lovable') {
    return { error: new Error('The "lovable" identity provider is not available on this deployment.') };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: opts?.redirect_uri || (typeof window !== 'undefined' ? window.location.origin : undefined),
      queryParams: opts?.extraParams,
    },
  });

  if (error) return { error };
  // Supabase navigates the browser to the provider.
  return { redirected: true };
}

export const lovable = {
  auth: {
    signInWithOAuth: (
      provider: 'google' | 'apple' | 'microsoft' | 'lovable',
      opts?: SignInOptions,
    ): Promise<SignInResult> =>
      authProvider === 'lovable' ? signInWithLovable(provider, opts) : signInWithSupabase(provider, opts),
  },
};
