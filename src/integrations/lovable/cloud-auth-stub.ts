// Build-time replacement for @lovable.dev/cloud-auth-js.
// Used whenever VITE_AUTH_PROVIDER is not "lovable" (i.e. every build that
// runs against the external Supabase project), so the Lovable auth broker is
// physically absent from the production bundle.
export function createLovableAuth() {
  return {
    signInWithOAuth: async () => ({
      redirected: false,
      error: new Error(
        'Lovable-brokered OAuth is not available in this build. Native Supabase Auth is in use.',
      ),
    }),
  };
}
