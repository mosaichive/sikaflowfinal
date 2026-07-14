// Preview audience count + first N sample recipients for a campaign.
// Super admin only.
import {
  corsHeaders,
  requireSuperAdmin,
  resolveAudience,
  serviceClient,
} from "../_shared/email-bulk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const guard = await requireSuperAdmin(req);
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => ({}));
    const audienceType = body.audience_type ?? "all_users";
    const filter = body.audience_filter ?? {};
    const admin = serviceClient();
    const recipients = await resolveAudience(admin, audienceType, filter);
    return new Response(
      JSON.stringify({
        count: recipients.length,
        sample: recipients.slice(0, 10).map((r) => r.email),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("audience-preview error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "internal" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
