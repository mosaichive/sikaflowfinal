// Shared Paystack helpers used by paystack-verify and paystack-webhook.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

export const PAYSTACK_BASE = "https://api.paystack.co";
export const PLAN_PRICES: Record<string, number> = { monthly: 50, annual: 500 };
export const PLAN_DAYS: Record<string, number> = { monthly: 30, annual: 365 };

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
  const expectedAmount = PLAN_PRICES[payment.plan] ?? Number(payment.amount);
  const metadataUserId = verifyData?.data?.metadata?.user_id;

  if (Math.abs(amountPaid - expectedAmount) > 0.01) {
    await admin.from("subscription_payments").update({
      status: "review",
      note: `Amount mismatch: paid GH₵${amountPaid}, expected GH₵${expectedAmount}`,
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
  const days = PLAN_DAYS[payment.plan] ?? 30;
  const expires = new Date(now.getTime() + days * 86400000);

  await admin.from("subscription_payments").update({
    status: "confirmed",
    amount_paid: amountPaid,
    reviewed_at: now.toISOString(),
    paystack_reference: reference,
    provider_response: verifyData,
    expires_at: expires.toISOString(),
    note: "Activated automatically by Paystack verification",
  }).eq("id", payment.id);

  await admin.from("profiles").update({
    subscription_plan: payment.plan,
    subscription_status: "active",
    subscription_start_date: now.toISOString(),
    subscription_end_date: expires.toISOString(),
  }).eq("id", payment.user_id);

  return { status: "confirmed", expires_at: expires.toISOString() };
}
