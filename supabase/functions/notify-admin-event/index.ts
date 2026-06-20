// Sends a Super Admin SMS for user-submitted platform notifications
// (support tickets, feedback, ad/advertise applications, etc.).
// Public endpoint: validates `type` against a strict whitelist and never
// echoes provider details. Best-effort: returns ok even if SMS fails.
import { notifySuperAdmin } from "../_shared/super-admin-sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TYPE_LABELS: Record<string, string> = {
  support: "Support Ticket",
  feedback: "Feedback",
  contact: "Contact Message",
  complaint: "Complaint",
  business_verification: "Business Verification Request",
  payment_support: "Payment/Subscription Support Request",
  ad_application: "Advertise Application",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(s: unknown, max = 80): string {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_json" }, 400); }

  const rawType = clean(body.type, 40).toLowerCase().replace(/[^a-z_]/g, "");
  const label = TYPE_LABELS[rawType];
  if (!label) return json({ ok: false, reason: "invalid_type" }, 400);

  const sender = clean(body.business_name ?? body.sender_name ?? body.name ?? body.email ?? "A user", 80) || "A user";

  const message = `KudiTrack Admin Alert: New ${label} from ${sender}. Check Super Admin dashboard.`;
  const result = await notifySuperAdmin(message, { kind: "admin_event", type: rawType });
  return json({ ok: true, delivered: result.ok });
});
