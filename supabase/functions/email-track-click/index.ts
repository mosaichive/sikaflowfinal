// Public click tracker — records click and redirects to the original URL.
import { corsHeaders, serviceClient } from "../_shared/email-bulk.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("c");
  const recipientId = url.searchParams.get("r");
  const target = url.searchParams.get("u") ?? "https://kuditrack.online";

  // Validate url shape to avoid open redirect abuse
  let safeTarget = "https://kuditrack.online";
  try {
    const parsed = new URL(target);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      safeTarget = parsed.toString();
    }
  } catch {
    // fallback
  }

  try {
    if (campaignId && recipientId && recipientId !== "test") {
      const admin = serviceClient();
      const now = new Date().toISOString();
      const { data: rec } = await admin
        .from("email_campaign_recipients")
        .select("id, first_clicked_at, click_count")
        .eq("id", recipientId)
        .maybeSingle();
      if (rec) {
        const isFirst = !rec.first_clicked_at;
        await admin
          .from("email_campaign_recipients")
          .update({
            first_clicked_at: rec.first_clicked_at ?? now,
            click_count: (rec.click_count ?? 0) + 1,
          })
          .eq("id", rec.id);
        const { data: camp } = await admin
          .from("email_campaigns")
          .select("click_count, unique_click_count")
          .eq("id", campaignId)
          .maybeSingle();
        if (camp) {
          await admin
            .from("email_campaigns")
            .update({
              click_count: (camp.click_count ?? 0) + 1,
              unique_click_count: (camp.unique_click_count ?? 0) +
                (isFirst ? 1 : 0),
            })
            .eq("id", campaignId);
        }
      }
    }
  } catch (e) {
    console.error("track click", e);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: safeTarget, ...corsHeaders },
  });
});
