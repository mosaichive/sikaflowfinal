import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures a user is signed in and has completed onboarding.
 * Redirects to /login or /onboarding otherwise.
 * Returns { ready, user } once safe to render.
 */
export function useRequireUser() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) {
        await supabase.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id" });
        navigate({ to: "/onboarding" }); return;
      }
      if (!data.onboarding_completed) { navigate({ to: "/onboarding" }); return; }
      setReady(true);
    })();
  }, [user, loading, navigate]);

  return { ready, user };
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}
