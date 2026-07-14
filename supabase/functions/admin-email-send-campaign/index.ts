// Send a campaign — supports test send, immediate send, and scheduled runner mode.
// Actions:
//   { action: "test", campaign_id, to: ["a@b.com"] }
//   { action: "send", campaign_id }                 // send now
//   { action: "run_scheduled" }                     // pg_cron trigger, sends any campaigns due
//
// Rate-limited batched delivery via Resend through the Lovable connector gateway.
import {
  corsHeaders,
  renderTemplate,
  requireSuperAdmin,
  resolveAudience,
  serviceClient,
  wrapHtmlForTracking,
} from "../_shared/email-bulk.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/resend";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://kuditrack.online";

const BATCH_SIZE = 90; // Resend batch API accepts up to 100
const BATCH_DELAY_MS = 1100;

async function sendBatch(payload: unknown[]) {
  const resp = await fetch(`${GATEWAY}/emails/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY!,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`Resend batch failed [${resp.status}]: ${text}`);
    return { ok: false, status: resp.status, body: text, data: null };
  }
  try {
    return { ok: true, status: 200, body: text, data: JSON.parse(text) };
  } catch {
    return { ok: true, status: 200, body: text, data: null };
  }
}

async function processCampaign(campaignId: string, actorId: string | null) {
  const admin = serviceClient();
  const { data: campaign, error: cErr } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr || !campaign) throw new Error("Campaign not found");
  if (campaign.status === "sent" || campaign.status === "sending") {
    return { ok: true, already: true };
  }

  // Mark as sending
  await admin
    .from("email_campaigns")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", campaignId);

  // Build recipients if not already snapshotted
  const { count: existingCount } = await admin
    .from("email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (!existingCount) {
    const audience = await resolveAudience(
      admin,
      campaign.audience_type,
      campaign.audience_filter ?? {},
    );
    if (audience.length) {
      const rows = audience.map((r) => ({
        campaign_id: campaignId,
        email: r.email,
        user_id: r.user_id,
        merge_data: r.merge_data,
        status: "pending",
      }));
      // Insert in chunks of 1000
      for (let i = 0; i < rows.length; i += 1000) {
        await admin
          .from("email_campaign_recipients")
          .insert(rows.slice(i, i + 1000));
      }
      await admin
        .from("email_campaigns")
        .update({ recipient_count: audience.length })
        .eq("id", campaignId);
    }
  }

  // Fetch pending recipients
  let totalSent = 0;
  let totalFailed = 0;
  while (true) {
    const { data: pending } = await admin
      .from("email_campaign_recipients")
      .select("id, email, merge_data")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .limit(BATCH_SIZE);

    if (!pending || pending.length === 0) break;

    const batchPayload = pending.map((r) => {
      const merge = (r.merge_data as Record<string, unknown>) ?? {};
      const unsubUrl =
        `${PUBLIC_APP_URL}/unsubscribe?e=${encodeURIComponent(r.email)}&c=${campaignId}`;
      const bodyHtml = wrapHtmlForTracking(
        renderTemplate(campaign.body_html ?? "", merge),
        campaignId,
        r.id,
        SUPABASE_URL,
        unsubUrl,
      );
      return {
        from: `${campaign.from_name} <${campaign.from_email}>`,
        to: [r.email],
        subject: renderTemplate(campaign.subject ?? "", merge),
        html: bodyHtml,
        reply_to: campaign.reply_to || undefined,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    const { ok, data } = await sendBatch(batchPayload);
    const now = new Date().toISOString();
    if (!ok) {
      totalFailed += pending.length;
      await admin
        .from("email_campaign_recipients")
        .update({ status: "failed", error_message: "batch send failed" })
        .in("id", pending.map((r) => r.id));
    } else {
      const returned = (data as { data?: Array<{ id: string }> })?.data ?? [];
      for (let i = 0; i < pending.length; i++) {
        const rid = pending[i].id;
        const messageId = returned[i]?.id ?? null;
        await admin
          .from("email_campaign_recipients")
          .update({
            status: "sent",
            sent_at: now,
            resend_message_id: messageId,
          })
          .eq("id", rid);
      }
      totalSent += pending.length;
    }

    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }

  await admin
    .from("email_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      delivered_count: totalSent,
      failed_count: totalFailed,
    })
    .eq("id", campaignId);

  await admin.from("email_audit_log").insert({
    actor_id: actorId,
    action: "campaign_sent",
    campaign_id: campaignId,
    details: { sent: totalSent, failed: totalFailed },
  });

  return { ok: true, sent: totalSent, failed: totalFailed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "email provider not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Cron-triggered runner: send campaigns with scheduled_at <= now.
    if (action === "run_scheduled") {
      const admin = serviceClient();
      const { data: due } = await admin
        .from("email_campaigns")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(5);
      const results: unknown[] = [];
      for (const c of due ?? []) {
        try {
          results.push(await processCampaign(c.id, null));
        } catch (e) {
          console.error("scheduled campaign failed", c.id, e);
        }
      }
      return new Response(JSON.stringify({ ok: true, processed: results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Everything else requires super admin
    const guard = await requireSuperAdmin(req);
    if (guard instanceof Response) return guard;
    const { userId } = guard;

    if (action === "test") {
      const admin = serviceClient();
      const { data: campaign } = await admin
        .from("email_campaigns")
        .select("*")
        .eq("id", body.campaign_id)
        .maybeSingle();
      if (!campaign) throw new Error("Campaign not found");
      const to = (body.to ?? []) as string[];
      if (to.length === 0) throw new Error("no recipients");
      const merge = {
        business_name: "Test Business",
        owner_name: "Test Owner",
        first_name: "Test",
        subscription_plan: "business",
        expiry_date: "2026-12-31",
        store_link: "https://kuditrack.online/store/example",
      };
      const html = wrapHtmlForTracking(
        renderTemplate(campaign.body_html ?? "", merge),
        campaign.id,
        "test",
        SUPABASE_URL,
        `${PUBLIC_APP_URL}/unsubscribe`,
      );
      const payload = to.map((email) => ({
        from: `${campaign.from_name} <${campaign.from_email}>`,
        to: [email],
        subject: `[TEST] ${renderTemplate(campaign.subject ?? "", merge)}`,
        html,
        reply_to: campaign.reply_to || undefined,
      }));
      const { ok, status, body: rbody } = await sendBatch(payload);
      await admin.from("email_audit_log").insert({
        actor_id: userId,
        action: "campaign_test_sent",
        campaign_id: campaign.id,
        details: { to, ok },
      });
      return new Response(
        JSON.stringify({ ok, status, body: rbody }),
        {
          status: ok ? 200 : status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "send") {
      const result = await processCampaign(body.campaign_id, userId);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-campaign error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "internal" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
