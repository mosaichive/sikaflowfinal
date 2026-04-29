import { supabase } from "@/integrations/supabase/client";

/** Returns the path the user should land on after sign-in. */
export async function postLoginRedirect(userId: string): Promise<string> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roles?.some((r) => r.role === "super_admin")) return "/admin";
  return "/dashboard";
}
