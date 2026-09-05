// Paystack webhook — verifies HMAC signature, then activates the matching
// subscription_payments row using the same logic as paystack-verify.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { activatePayment } from "../_shared/paystack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha512Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) return json({ error: "payment_provider_unavailable" }, 503);

    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > 262144) return json({ error: "payload_too_large" }, 413);
    const payloadText = await req.text();
    if (payloadText.length > 262144) return json({ error: "payload_too_large" }, 413);
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const expected = await hmacSha512Hex(paystackSecret, payloadText);
    if (!signature || !constantTimeEqual(signature, expected)) return json({ error: "invalid_signature" }, 401);

    const event = JSON.parse(payloadText);
    if (event?.event !== "charge.success") return json({ success: true, ignored: true });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const reference: string | undefined = event?.data?.reference;
    if (!reference || !/^[A-Za-z0-9_-]{10,120}$/.test(reference)) return json({ success: true, ignored: true });

    const { data: payment } = await admin
      .from("subscription_payments")
      .select("id,user_id,plan,amount,status")
      .or(`paystack_reference.eq.${reference},reference.eq.${reference}`)
      .maybeSingle();
    if (!payment) return json({ success: true, ignored: true, reason: "payment_not_found" });

    const result = await activatePayment(admin, payment, event, reference);
    return json({ success: true, ...result });
  } catch (error) {
    console.error("[paystack-webhook] error", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "request_failed" }, 500);
  }
});
