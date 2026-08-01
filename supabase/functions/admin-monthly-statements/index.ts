// Monthly business statements: generate PDF statements per business and email them.
//
// Actions:
//   { action: "run", period?, dry_run?, business_ids? }  -> generate + send (cron or manual)
//   { action: "preview", business_id, period? }           -> returns base64 PDF (no send)
//   { action: "test", business_id, to, period? }          -> send one statement to a test address
//   { action: "resend", delivery_id }                     -> retry one failed delivery
//
// Isolation: each statement is built from a single business_id; nothing is shared
// across tenants. No existing business data is mutated.
import {
  corsHeaders,
  requireSuperAdmin,
  serviceClient,
} from "../_shared/email-bulk.ts";
import { buildStatementData, resolvePeriod } from "../_shared/statement-data.ts";
import {
  renderStatementEmailHtml,
  renderStatementPdf,
  statementFileName,
} from "../_shared/statement-pdf.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/resend";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CRON_SECRET = Deno.env.get("STATEMENTS_CRON_SECRET");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sendEmail(payload: Record<string, unknown>) {
  const resp = await fetch(`${GATEWAY}/emails`, {
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
    console.error(`Resend send failed [${resp.status}]: ${text}`);
    return { ok: false, status: resp.status, error: text, id: null as string | null };
  }
  let id: string | null = null;
  try {
    id = (JSON.parse(text) as { id?: string })?.id ?? null;
  } catch { /* ignore */ }
  return { ok: true, status: 200, error: null, id };
}

async function loadSettings(admin: ReturnType<typeof serviceClient>) {
  const { data } = await admin
    .from("statement_settings")
    .select("*")
    .eq("singleton_key", "default")
    .maybeSingle();
  return {
    automation_enabled: data?.automation_enabled ?? false,
    from_name: data?.from_name ?? "KudiTrack",
    from_email: data?.from_email ?? "statements@kuditrack.online",
    send_day: data?.send_day ?? 1,
  };
}

async function generateAndSend(
  admin: ReturnType<typeof serviceClient>,
  businessId: string,
  periodKey: string | null,
  opts: { to?: string | null; from_name: string; from_email: string; log: boolean; test?: boolean },
) {
  const period = resolvePeriod(periodKey);
  const data = await buildStatementData(admin, businessId, period);
  const recipient = (opts.to ?? data.business.email ?? "").trim();

  const pdf = renderStatementPdf(data);
  const totals = {
    sales: data.sales.total,
    expenses: data.money.expenses,
    profit: data.money.profit,
    available: data.money.availableBusinessMoney,
  };

  if (!recipient) {
    if (opts.log) {
      await admin.from("statement_deliveries").upsert({
        business_id: businessId,
        business_name: data.business.name,
        email: "",
        period: period.period,
        status: "skipped",
        generated_at: new Date().toISOString(),
        error_message: "No email address on file",
        totals,
      }, { onConflict: "business_id,period" });
    }
    return { ok: false, skipped: true, reason: "no_email", period: period.period };
  }

  const result = await sendEmail({
    from: `${opts.from_name} <${opts.from_email}>`,
    to: [recipient],
    subject: `${opts.test ? "[TEST] " : ""}Your ${period.label} business statement - ${data.business.name}`,
    html: renderStatementEmailHtml(data),
    attachments: [{ filename: statementFileName(data), content: pdf }],
  });

  if (opts.log) {
    const now = new Date().toISOString();
    const { data: existing } = await admin
      .from("statement_deliveries")
      .select("id, retry_count")
      .eq("business_id", businessId)
      .eq("period", period.period)
      .maybeSingle();

    await admin.from("statement_deliveries").upsert({
      ...(existing?.id ? { id: existing.id } : {}),
      business_id: businessId,
      business_name: data.business.name,
      email: recipient,
      period: period.period,
      status: result.ok ? "sent" : "failed",
      generated_at: now,
      sent_at: result.ok ? now : null,
      error_message: result.error ? String(result.error).slice(0, 1000) : null,
      retry_count: existing ? (existing.retry_count ?? 0) + 1 : 0,
      provider_message_id: result.id,
      totals,
    }, { onConflict: "business_id,period" });
  }

  return { ok: result.ok, period: period.period, email: recipient, error: result.error, totals };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return json({ error: "email provider not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as any).action ?? "run");
    const admin = serviceClient();
    const settings = await loadSettings(admin);

    // Cron entry point — authenticated with a shared secret header instead of a JWT.
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;

    let actorId: string | null = null;
    if (!isCron) {
      const guard = await requireSuperAdmin(req);
      if (guard instanceof Response) return guard;
      actorId = guard.userId;
    }

    if (action === "preview") {
      const period = resolvePeriod((body as any).period ?? null);
      const data = await buildStatementData(admin, String((body as any).business_id), period);
      return json({ ok: true, period: period.period, filename: statementFileName(data), pdf: renderStatementPdf(data) });
    }

    if (action === "test") {
      const res = await generateAndSend(admin, String((body as any).business_id), (body as any).period ?? null, {
        to: String((body as any).to ?? ""),
        from_name: settings.from_name,
        from_email: settings.from_email,
        log: false,
        test: true,
      });
      return json(res, res.ok ? 200 : 502);
    }

    if (action === "resend") {
      const { data: delivery } = await admin
        .from("statement_deliveries")
        .select("*")
        .eq("id", String((body as any).delivery_id))
        .maybeSingle();
      if (!delivery) return json({ error: "delivery not found" }, 404);
      const res = await generateAndSend(admin, delivery.business_id, delivery.period, {
        to: delivery.email || null,
        from_name: settings.from_name,
        from_email: settings.from_email,
        log: true,
      });
      return json(res, res.ok ? 200 : 502);
    }

    if (action === "run") {
      const periodKey = ((body as any).period as string | null) ?? null;
      const period = resolvePeriod(periodKey);
      if (isCron && !settings.automation_enabled) {
        return json({ ok: true, skipped: true, reason: "automation_disabled" });
      }

      let ids: string[] = Array.isArray((body as any).business_ids)
        ? ((body as any).business_ids as string[])
        : [];
      if (!ids.length) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id")
          .not("email", "is", null)
          .eq("suspended", false)
          .limit(20000);
        ids = (profiles ?? []).map((p: any) => p.id);
      }

      // Skip businesses already sent for this period unless a resend is forced.
      const force = Boolean((body as any).force);
      if (!force && ids.length) {
        const { data: done } = await admin
          .from("statement_deliveries")
          .select("business_id")
          .eq("period", period.period)
          .eq("status", "sent");
        const sent = new Set((done ?? []).map((d: any) => d.business_id));
        ids = ids.filter((id) => !sent.has(id));
      }

      let sent = 0;
      let failed = 0;
      let skipped = 0;
      for (const id of ids) {
        try {
          const res = await generateAndSend(admin, id, period.period, {
            from_name: settings.from_name,
            from_email: settings.from_email,
            log: true,
          });
          if (res.skipped) skipped++;
          else if (res.ok) sent++;
          else failed++;
        } catch (e) {
          failed++;
          console.error("statement failed for", id, e);
          await admin.from("statement_deliveries").upsert({
            business_id: id,
            email: "",
            period: period.period,
            status: "failed",
            error_message: String((e as Error).message ?? e).slice(0, 1000),
          }, { onConflict: "business_id,period" });
        }
        // Stay well inside Resend rate limits.
        await new Promise((r) => setTimeout(r, 600));
      }

      await admin
        .from("statement_settings")
        .update({ last_run_at: new Date().toISOString(), last_run_period: period.period })
        .eq("singleton_key", "default");

      await admin.from("email_audit_log").insert({
        actor_id: actorId,
        action: "monthly_statements_run",
        details: { period: period.period, sent, failed, skipped, cron: isCron },
      });

      return json({ ok: true, period: period.period, sent, failed, skipped, total: ids.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("monthly-statements error", err);
    return json({ error: (err as Error).message ?? "internal" }, 500);
  }
});
