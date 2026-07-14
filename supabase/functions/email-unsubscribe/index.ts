// Public marketing unsubscribe endpoint. GET or POST with ?e=email&c=campaign
// Adds the email to email_marketing_unsubscribes AND flips
// profiles.marketing_emails_opted_out. Transactional emails still send.
import { corsHeaders, serviceClient } from "../_shared/email-bulk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const campaignId = url.searchParams.get("c");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: "invalid email" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = serviceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  await admin
    .from("email_marketing_unsubscribes")
    .upsert(
      {
        email,
        user_id: profile?.id ?? null,
        source: campaignId ? `campaign:${campaignId}` : "public",
      },
      { onConflict: "email" },
    );

  if (profile?.id) {
    await admin
      .from("profiles")
      .update({ marketing_emails_opted_out: true })
      .eq("id", profile.id);
  }

  if (campaignId) {
    await admin
      .from("email_campaign_recipients")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("email", email);
    const { data: camp } = await admin
      .from("email_campaigns")
      .select("unsubscribe_count")
      .eq("id", campaignId)
      .maybeSingle();
    if (camp) {
      await admin
        .from("email_campaigns")
        .update({ unsubscribe_count: (camp.unsubscribe_count ?? 0) + 1 })
        .eq("id", campaignId);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, email }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
