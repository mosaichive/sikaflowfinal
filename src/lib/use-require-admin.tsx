import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Require the current user to have super_admin role.
 * Redirects to /login if signed out, or /dashboard if signed in but not admin.
 */
export function useRequireAdmin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!data) { navigate({ to: "/dashboard" }); return; }
      setReady(true);
    })();
  }, [user, loading, navigate]);

  return { ready, user };
}
