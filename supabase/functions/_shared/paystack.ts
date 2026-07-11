// Shared Paystack helpers used by paystack-verify and paystack-webhook.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { notifySuperAdmin } from "./super-admin-sms.ts";

const PLAN_LABELS: Record<string, string> = {
  monthly: "Monthly", annual: "Annual",
  starter: "Starter", business: "Business", business_plus: "Business Plus",
};

export const PAYSTACK_BASE = "https://api.paystack.co";
// Legacy plans keep fixed pricing so old subscribers can still renew.
export const LEGACY_PRICES: Record<string, number> = { monthly: 50, annual: 500 };
export const LEGACY_DAYS: Record<string, number> = { monthly: 30, annual: 365 };
const NEW_TIERS = new Set(["starter", "business", "business_plus"]);

async function resolvePlanPricing(
  admin: SupabaseClient,
  plan: string,
  cycle: "monthly" | "annual",
): Promise<{ amount: number; days: number } | null> {
  if (LEGACY_PRICES[plan] !== undefined) {
    return { amount: LEGACY_PRICES[plan], days: LEGACY_DAYS[plan] ?? 30 };
  }
  if (NEW_TIERS.has(plan)) {
    const { data } = await admin
      .from("pricing_plans")
      .select("price_monthly, price_annual")
      .eq("tier", plan)
      .maybeSingle();
    if (!data) return null;
    const amount = Number(cycle === "annual" ? data.price_annual : data.price_monthly) || 0;
    const days = cycle === "annual" ? 365 : 30;
    return { amount, days };
  }
  return null;
}

export async function activatePayment(
  admin: SupabaseClient,
  payment: { id: string; user_id: string; plan: string; amount: number; status: string },
  verifyData: any,
  reference: string,
) {
  if (payment.status === "confirmed" || payment.status === "approved") {
    const { data: profile } = await admin
      .from("profiles")
      .select("subscription_end_date")
      .eq("id", payment.user_id)
      .maybeSingle();
    return { status: "confirmed", expires_at: profile?.subscription_end_date ?? null };
  }

  const amountPaid = typeof verifyData?.data?.amount === "number" ? verifyData.data.amount / 100 : 0;
  const metadataUserId = verifyData?.data?.metadata?.user_id;
  const metadataCycle = (verifyData?.data?.metadata?.cycle === "annual" ? "annual" : "monthly") as "monthly" | "annual";
  // Derive cycle for legacy plans from the plan name itself.
  const cycle: "monthly" | "annual" =
    payment.plan === "annual" ? "annual" : payment.plan === "monthly" ? "monthly" : metadataCycle;

  const pricing = await resolvePlanPricing(admin, payment.plan, cycle);
  const expectedAmount = pricing?.amount ?? Number(payment.amount);
  const days = pricing?.days ?? 30;

  if (Math.abs(amountPaid - expectedAmount) > 0.01) {
    await admin.from("subscription_payments").update({
      status: "review",
      note: `Amount mismatch: paid GH₵${amountPaid}, expected GH₵${expectedAmount} (${payment.plan}/${cycle})`,
      amount_paid: amountPaid,
      provider_response: verifyData,
    }).eq("id", payment.id);
    return { status: "review", expires_at: null, reason: "amount_mismatch" };
  }

  if (metadataUserId && metadataUserId !== payment.user_id) {
    await admin.from("subscription_payments").update({
      status: "review",
      note: "User mismatch in metadata",
      amount_paid: amountPaid,
      provider_response: verifyData,
    }).eq("id", payment.id);
    return { status: "review", expires_at: null, reason: "user_mismatch" };
  }

  const now = new Date();
  const expires = new Date(now.getTime() + days * 86400000);

  await admin.from("subscription_payments").update({
    status: "confirmed",
    amount_paid: amountPaid,
    reviewed_at: now.toISOString(),
    paystack_reference: reference,
    provider_response: verifyData,
    expires_at: expires.toISOString(),
    note: `Activated automatically by Paystack (${payment.plan} · ${cycle})`,
  }).eq("id", payment.id);

  await admin.from("profiles").update({
    subscription_plan: payment.plan,
    subscription_status: "active",
    subscription_start_date: now.toISOString(),
    subscription_end_date: expires.toISOString(),
  }).eq("id", payment.user_id);

  // Fire-and-forget Super Admin SMS for successful payment. Never blocks activation.
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("business_name,display_name,email")
      .eq("id", payment.user_id)
      .maybeSingle();
    const businessName = profile?.business_name || profile?.display_name || profile?.email || "A KudiTrack user";
    const planLabel = PLAN_LABELS[payment.plan] ?? payment.plan;
    const message = `KudiTrack Payment Alert: ${businessName} activated ${planLabel} (${cycle}) — GH₵${amountPaid}. Ref: ${reference}.`;
    await notifySuperAdmin(message, { kind: "payment_success", reference, user_id: payment.user_id });
  } catch (err) {
    console.error("[paystack] super-admin notify error (non-blocking)", err);
  }

  return { status: "confirmed", expires_at: expires.toISOString() };
}
