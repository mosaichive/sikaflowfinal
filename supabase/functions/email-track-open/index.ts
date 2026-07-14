// Public tracking pixel — records opens.
import { corsHeaders, serviceClient } from "../_shared/email-bulk.ts";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("c");
    const recipientId = url.searchParams.get("r");
    if (campaignId && recipientId && recipientId !== "test") {
      const admin = serviceClient();
      const now = new Date().toISOString();
      // Increment atomically-ish: read then write
      const { data: rec } = await admin
        .from("email_campaign_recipients")
        .select("id, opened_at, open_count")
        .eq("id", recipientId)
        .maybeSingle();
      if (rec) {
        const isFirst = !rec.opened_at;
        await admin
          .from("email_campaign_recipients")
          .update({
            opened_at: rec.opened_at ?? now,
            open_count: (rec.open_count ?? 0) + 1,
          })
          .eq("id", rec.id);
        // Bump campaign counters
        const { data: camp } = await admin
          .from("email_campaigns")
          .select("open_count, unique_open_count")
          .eq("id", campaignId)
          .maybeSingle();
        if (camp) {
          await admin
            .from("email_campaigns")
            .update({
              open_count: (camp.open_count ?? 0) + 1,
              unique_open_count: (camp.unique_open_count ?? 0) +
                (isFirst ? 1 : 0),
            })
            .eq("id", campaignId);
        }
      }
    }
  } catch (e) {
    console.error("track open", e);
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
});
