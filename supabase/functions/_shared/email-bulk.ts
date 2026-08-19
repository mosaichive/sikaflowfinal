// Shared helpers for the bulk email system.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function requireSuperAdmin(req: Request): Promise<
  { userId: string; email: string | null } | Response
> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = serviceClient();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: role } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id, email: userData.user.email ?? null };
}

export type AudienceType =
  | "all_users"
  | "starter"
  | "business"
  | "business_plus"
  | "trial_users"
  | "expired"
  | "active"
  | "canceled"
  | "specific_businesses"
  | "specific_emails";

export interface AudienceFilter {
  business_ids?: string[];
  emails?: string[];
}

/**
 * Build the list of recipients for a campaign audience.
 * Excludes marketing unsubscribers and dedupes by email.
 */
export async function resolveAudience(
  admin: SupabaseClient,
  audienceType: AudienceType,
  filter: AudienceFilter,
): Promise<Array<{
  email: string;
  user_id: string | null;
  merge_data: Record<string, unknown>;
}>> {
  const results: Array<{
    email: string;
    user_id: string | null;
    merge_data: Record<string, unknown>;
  }> = [];

  const applyProfileRows = (
    rows: Array<Record<string, unknown>> | null | undefined,
  ) => {
    for (const p of rows ?? []) {
      const email = String((p as any).email ?? "").trim().toLowerCase();
      if (!email) continue;
      results.push({
        email,
        user_id: (p as any).id as string,
        merge_data: {
          business_name: (p as any).business_name ?? "",
          owner_name: (p as any).display_name ?? "",
          first_name: String((p as any).display_name ?? "").split(" ")[0] ?? "",
          subscription_plan: (p as any).subscription_plan ?? "",
          expiry_date: (p as any).subscription_end_date ?? "",
          store_link: (p as any).store_slug
            ? `https://kuditrack.online/store/${(p as any).store_slug}`
            : "",
        },
      });
    }
  };

  if (audienceType === "specific_emails") {
    for (const raw of filter.emails ?? []) {
      const email = String(raw).trim().toLowerCase();
      if (!email) continue;
      const { data: p } = await admin
        .from("profiles")
        .select(
          "id, email, business_name, display_name, subscription_plan, subscription_end_date, store_slug",
        )
        .eq("email", email)
        .maybeSingle();
      if (p) {
        applyProfileRows([p as any]);
      } else {
        results.push({ email, user_id: null, merge_data: {} });
      }
    }
  } else {
    let q = admin
      .from("profiles")
      .select(
        "id, email, business_name, display_name, subscription_plan, subscription_status, subscription_end_date, store_slug, marketing_emails_opted_out",
      )
      .not("email", "is", null);

    switch (audienceType) {
      case "starter":
        q = q.eq("subscription_plan", "starter");
        break;
      case "business":
        q = q.eq("subscription_plan", "business");
        break;
      case "business_plus":
        q = q.eq("subscription_plan", "business_plus");
        break;
      case "trial_users":
        q = q.eq("subscription_status", "trial");
        break;
      case "active":
        q = q.eq("subscription_status", "active");
        break;
      case "expired":
        q = q.in("subscription_status", ["expired", "overdue"]);
        break;
      case "canceled":
        q = q.eq("subscription_status", "canceled");
        break;
      case "specific_businesses":
        q = q.in("id", filter.business_ids ?? []);
        break;
      case "all_users":
      default:
        break;
    }

    const { data } = await q.limit(50000);
    applyProfileRows(data as any);
  }

  // Exclude marketing unsubscribes
  const emails = Array.from(new Set(results.map((r) => r.email)));
  const { data: unsubs } = await admin
    .from("email_marketing_unsubscribes")
    .select("email")
    .in("email", emails);
  const unsubSet = new Set(
    (unsubs ?? []).map((u: any) => String(u.email).toLowerCase()),
  );

  // Also honor profile.marketing_emails_opted_out
  const { data: optedOut } = await admin
    .from("profiles")
    .select("email")
    .eq("marketing_emails_opted_out", true)
    .in("email", emails);
  for (const p of optedOut ?? []) {
    unsubSet.add(String((p as any).email).toLowerCase());
  }

  // Dedupe by email, honor unsubscribes
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.email) || unsubSet.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

export function renderTemplate(
  html: string,
  merge: Record<string, unknown>,
): string {
  return html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key) => {
    const v = merge[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export function wrapHtmlForTracking(
  html: string,
  campaignId: string,
  recipientId: string,
  supabaseUrl: string,
  unsubscribeUrl: string,
): string {
  const trackBase = `${supabaseUrl}/functions/v1`;
  // Rewrite anchor hrefs (skip mailto: / anchors / already-tracked)
  const rewritten = html.replace(
    /<a\s+([^>]*?)href=(["'])([^"']+)\2([^>]*)>/gi,
    (_m, pre, quote, href, post) => {
      if (
        /^(mailto:|tel:|#|javascript:)/i.test(href) ||
        href.includes("email-track-click")
      ) {
        return `<a ${pre}href=${quote}${href}${quote}${post}>`;
      }
      const proxied = `${trackBase}/email-track-click?c=${campaignId}&r=${recipientId}&u=${
        encodeURIComponent(href)
      }`;
      return `<a ${pre}href=${quote}${proxied}${quote}${post}>`;
    },
  );

  const pixel =
    `<img src="${trackBase}/email-track-open?c=${campaignId}&r=${recipientId}" alt="" width="1" height="1" style="display:none;border:0;outline:none;" />`;
  const footer = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;font-family:sans-serif;">
      <p>You received this because you are a KudiTrack user.</p>
      <p><a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from marketing emails</a></p>
    </div>${pixel}`;

  if (/<\/body>/i.test(rewritten)) {
    return rewritten.replace(/<\/body>/i, `${footer}</body>`);
  }
  return rewritten + footer;
}

/**
 * Normalize a campaign body: if the author wrote plain text (no HTML tags),
 * turn blank-line-separated blocks into paragraphs and single newlines into <br>.
 */
export function normalizeBody(input: string): string {
  const body = (input ?? "").trim();
  if (!body) return "";
  if (/<(p|div|table|h[1-6]|ul|ol|br|img|a|section)\b/i.test(body)) return body;
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return body
    .split(/\n{2,}/)
    .map((block) =>
      `<p style="margin:0 0 16px;">${
        escape(block.trim()).replace(/\n/g, "<br />")
      }</p>`
    )
    .join("");
}

/**
 * Wrap the campaign body in a branded, email-client-safe layout so content
 * renders with proper spacing, width and typography instead of one text blob.
 */
export function layoutEmail(bodyHtml: string, subject = ""): string {
  const raw = (bodyHtml ?? "").trim();
  const isBlocks = raw.includes("<!--kt-blocks-->");
  const content = isBlocks ? raw : normalizeBody(raw);
  const inner = isBlocks
    ? content
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;">
        <tr><td style="padding:32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#1f2937;">${content}</td></tr>
      </table>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:0 0 18px;font-family:Helvetica,Arial,sans-serif;">
          <img src="https://kuditrack.online/icon-192.png" width="56" height="56" alt="KudiTrack" style="display:block;border:0;outline:none;border-radius:12px;margin:0 auto 10px;" />
          <div style="font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Kudi<span style="color:#0f766e;">Track</span></div>
        </td></tr>

        <tr><td>${inner}</td></tr>
        <tr><td align="center" style="padding:16px 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6b7280;line-height:1.6;">
          KudiTrack — Track Every Sale. Know Every Cedi.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
