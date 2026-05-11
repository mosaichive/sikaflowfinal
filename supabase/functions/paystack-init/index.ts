// Initialize a Paystack transaction for a subscription plan.
// Creates a pending row in subscription_payments and returns the
// Paystack authorization URL for redirect.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYSTACK_BASE = "https://api.paystack.co";

const PLAN_PRICES: Record<string, number> = { monthly: 50, annual: 500 };

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

    const body = await req.json() as { plan?: string; callback_url?: string };
    const plan = body.plan ?? "";
    const amount = PLAN_PRICES[plan];
    if (!amount) return json({ error: "invalid_plan" }, 400);

    const reference = `SF_${plan.toUpperCase()}_${user.id.slice(0, 8)}_${Date.now()}`;
    const admin = createClient(supabaseUrl, serviceKey);

    // Insert pending payment row first so we have the audit trail.
    const { data: paymentRow, error: insertError } = await admin
      .from("subscription_payments")
      .insert({
        user_id: user.id,
        plan,
        amount,
        payment_method: "paystack",
        reference,
        paystack_reference: reference,
        status: "pending",
        note: "Paystack checkout initialized",
      })
      .select("*")
      .single();
    if (insertError) return json({ error: "db_insert_failed", detail: insertError.message }, 500);

    const initRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amount * 100,
        currency: "GHS",
        reference,
        callback_url: body.callback_url,
        metadata: {
          user_id: user.id,
          plan,
          payment_id: paymentRow.id,
        },
      }),
    });
    const initData = await initRes.json();

    if (!initRes.ok || !initData?.status) {
      await admin
        .from("subscription_payments")
        .update({
          status: "failed",
          note: initData?.message || "Paystack init failed",
          provider_response: initData,
        })
        .eq("id", paymentRow.id);
      return json({ error: "paystack_init_failed", detail: initData }, 400);
    }

    return json({
      success: true,
      payment_id: paymentRow.id,
      authorization_url: initData.data.authorization_url,
      reference,
    });
  } catch (error) {
    console.error("[paystack-init] error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});
