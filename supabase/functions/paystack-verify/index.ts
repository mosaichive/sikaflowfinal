// Verify a Paystack reference and activate the user's plan if it succeeded.
// Idempotent — safe to call repeatedly while polling.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { activatePayment, PAYSTACK_BASE } from "../_shared/paystack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) return json({ error: "paystack_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json() as { reference?: string };
    const reference = body.reference;
    if (!reference) return json({ error: "reference_required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up the local payment record (must belong to this user).
    const { data: payment } = await admin
      .from("subscription_payments")
      .select("id,user_id,plan,amount,status")
      .or(`paystack_reference.eq.${reference},reference.eq.${reference}`)
      .maybeSingle();

    if (!payment) return json({ error: "payment_not_found" }, 404);
    if (payment.user_id !== user.id) return json({ error: "forbidden" }, 403);

    if (payment.status === "confirmed" || payment.status === "approved") {
      const { data: profile } = await admin
        .from("profiles")
        .select("subscription_end_date")
        .eq("id", payment.user_id)
        .maybeSingle();
      return json({ status: "confirmed", expires_at: profile?.subscription_end_date ?? null });
    }

    const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData?.status) {
      return json({ status: "pending", error: "verify_call_failed", detail: verifyData?.message }, 200);
    }

    const gatewayStatus = String(verifyData?.data?.status ?? "").toLowerCase();

    if (gatewayStatus === "success") {
      const result = await activatePayment(admin, payment, verifyData, reference);
      return json(result);
    }

    if (gatewayStatus === "failed" || gatewayStatus === "abandoned" || gatewayStatus === "reversed") {
      await admin.from("subscription_payments").update({
        status: "failed",
        note: verifyData?.data?.gateway_response || `Paystack returned ${gatewayStatus}`,
        provider_response: verifyData,
      }).eq("id", payment.id);
      return json({ status: "failed", reason: gatewayStatus });
    }

    return json({ status: "pending", gateway_status: gatewayStatus });
  } catch (error) {
    console.error("[paystack-verify] error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
