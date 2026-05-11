// Super admin: permanently delete a user and all their tenant data.
// The same email can sign up again afterward as a brand-new user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT_TABLES = [
  "sale_items",
  "sale_documents",
  "sales",
  "stock_movements",
  "restocks",
  "products",
  "customers",
  "expenses",
  "other_income",
  "savings",
  "investments",
  "investor_funding",
  "bank_accounts",
  "staff_invites",
  "staff_members",
  "subscription_payments",
  "support_messages",
  "audit_log",
];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is super_admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as { user_id?: string };
    const targetId = body.user_id;
    if (!targetId) return json({ error: "user_id_required" }, 400);
    if (targetId === user.id) return json({ error: "cannot_delete_self" }, 400);

    // Block deleting other super admins
    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    if ((targetRoles ?? []).some((row: { role: string }) => row.role === "super_admin")) {
      return json({ error: "cannot_delete_super_admin" }, 400);
    }

    // Best-effort cleanup of tenant data. Errors are logged but don't abort.
    for (const table of TENANT_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", targetId);
      if (error) console.warn(`[admin-delete-user] cleanup ${table} failed:`, error.message);
    }
    // Roles + profile
    await admin.from("user_roles").delete().eq("user_id", targetId);
    await admin.from("profiles").delete().eq("id", targetId);

    // Finally remove the auth user — this frees the email for re-registration.
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
    if (deleteError) {
      console.error("[admin-delete-user] auth delete failed:", deleteError.message);
      return json({ error: "auth_delete_failed", detail: deleteError.message }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("[admin-delete-user] error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
