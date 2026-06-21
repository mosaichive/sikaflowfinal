// Sends a Super Admin SMS for user-submitted platform notifications.
// Public endpoint with strict input validation and per-IP rate limiting.
// SMS is fire-and-forget; provider errors are never returned to the caller.
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

const MAX_SENDER_LEN = 80;
const MAX_PREVIEW_LEN = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const rateBuckets = new Map<string, { count: number; reset: number }>();

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  return ip;
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(key, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const key = clientKey(req);
  if (rateLimited(key)) {
    console.warn("[notify-admin-event] rate_limited", { key });
    return json({ ok: false, reason: "rate_limited" }, 429);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    console.warn("[notify-admin-event] bad_json", { key });
    return json({ ok: false, reason: "bad_json" }, 400);
  }

  const rawType = clean(body.type, 40).toLowerCase().replace(/[^a-z_]/g, "");
  const label = TYPE_LABELS[rawType];
  if (!label) {
    console.warn("[notify-admin-event] invalid_type", { key, rawType });
    return json({ ok: false, reason: "invalid_type" }, 400);
  }

  const sender = clean(body.business_name ?? body.sender_name ?? body.name ?? body.email ?? "", MAX_SENDER_LEN) || "A user";

  // Optional caller-supplied preview snippet — strictly sanitised & truncated.
  const previewRaw = clean(body.preview ?? body.subject ?? "", 500);
  if (body.preview !== undefined && previewRaw.length === 0) {
    console.warn("[notify-admin-event] empty_message", { key });
    return json({ ok: false, reason: "empty_message" }, 400);
  }
  if (previewRaw.length > MAX_PREVIEW_LEN * 3) {
    console.warn("[notify-admin-event] oversized_message", { key });
    return json({ ok: false, reason: "oversized_message" }, 413);
  }
  const preview = previewRaw.slice(0, MAX_PREVIEW_LEN);

  const tail = preview ? ` — "${preview}"` : "";
  const message = `KudiTrack Admin Alert: New ${label} from ${sender}.${tail} Check Super Admin dashboard.`;

  // Fire-and-forget. Never surface provider details to the caller.
  notifySuperAdmin(message, { kind: "admin_event", type: rawType }).catch((err) => {
    console.error("[notify-admin-event] sms_failed", { error: err instanceof Error ? err.message : String(err) });
  });

  return json({ ok: true });
});
