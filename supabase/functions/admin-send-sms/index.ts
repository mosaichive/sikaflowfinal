// Super-admin SMS broadcaster. Sends individual or bulk SMS via Africa's Talking.
// Auth: requires Bearer token of a user with role 'super_admin'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { sendSms, normalizePhone } from "../_shared/at-sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_LEN = 1;
const MAX_LEN = 320;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isE164(v: string) {
  return /^\+\d{8,15}$/.test(v);
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

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as {
      mode?: "individual" | "bulk";
      user_id?: string;
      message?: string;
    };

    const mode = body.mode;
    const message = String(body.message ?? "").trim();

    if (mode !== "individual" && mode !== "bulk") {
      return json({ error: "invalid_mode" }, 400);
    }
    if (message.length < MIN_LEN) return json({ error: "message_required" }, 400);
    if (message.length > MAX_LEN) return json({ error: "message_too_long" }, 413);

    // Collect recipients
    let recipients: { user_id: string; phone: string }[] = [];

    if (mode === "individual") {
      if (!body.user_id) return json({ error: "user_id_required" }, 400);
      const { data: prof } = await admin
        .from("profiles")
        .select("id, phone")
        .eq("id", body.user_id)
        .maybeSingle();
      if (!prof) return json({ error: "user_not_found" }, 404);
      const norm = normalizePhone(String(prof.phone ?? ""));
      if (!isE164(norm)) return json({ error: "user_has_no_valid_phone" }, 400);
      recipients = [{ user_id: prof.id, phone: norm }];
    } else {
      const { data: rows } = await admin
        .from("profiles")
        .select("id, phone")
        .not("phone", "is", null);
      const seen = new Set<string>();
      for (const r of rows ?? []) {
        const norm = normalizePhone(String((r as { phone?: string }).phone ?? ""));
        if (!isE164(norm)) continue;
        if (seen.has(norm)) continue;
        seen.add(norm);
        recipients.push({ user_id: (r as { id: string }).id, phone: norm });
      }
    }

    if (recipients.length === 0) {
      return json({ ok: true, sent: 0, failed: 0, results: [] });
    }

    let sent = 0;
    let failed = 0;
    const results: { phone: string; ok: boolean; error?: string }[] = [];

    for (const rcpt of recipients) {
      try {
        await sendSms({ to: rcpt.phone, message });
        sent++;
        results.push({ phone: rcpt.phone, ok: true });
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[admin-send-sms] send failed", { phone: rcpt.phone, error: msg });
        results.push({ phone: rcpt.phone, ok: false, error: msg });
      }
    }

    console.log("[admin-send-sms] complete", {
      mode, total: recipients.length, sent, failed, by: user.id,
    });

    return json({ ok: true, mode, total: recipients.length, sent, failed, results });
  } catch (error) {
    console.error("[admin-send-sms] error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
