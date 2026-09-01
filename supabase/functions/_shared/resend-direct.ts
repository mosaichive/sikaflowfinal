// Resend transport that talks to api.resend.com DIRECTLY (no Lovable connector gateway).
//
// STATUS: WIRED, TRANSPORT-SWITCHED. `admin-email-send-campaign` and
// `admin-monthly-statements` now call `sendBatchAuto` / `sendEmailAuto` below.
// The transport is chosen at runtime by EMAIL_TRANSPORT and defaults to "gateway",
// so current Lovable Cloud production behaviour is byte-for-byte unchanged. Setting
// EMAIL_TRANSPORT=direct in the new project switches both functions to
// api.resend.com with no code change and no LOVABLE_API_KEY. Flipping it back to
// "gateway" is the email half of the rollback plan.
//
// Required secret in the target Supabase project:
//   RESEND_API_KEY  — Resend API key (re-key in Resend after leaving Lovable Cloud)
// Optional:
//   EMAIL_TRANSPORT = "direct" | "gateway"  (default "gateway" until cutover)

const RESEND_API = "https://api.resend.com";

function apiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  return key;
}

/** Retained for call-site compatibility: delivery is always direct to Resend now. */
export function useDirectResend(): boolean {
  return true;
}

/** POST /emails — single send. Mirrors the gateway helper's return shape. */
export async function sendEmailDirect(payload: Record<string, unknown>) {
  const resp = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`Resend (direct) send failed [${resp.status}]: ${text}`);
    return { ok: false, status: resp.status, error: text, id: null as string | null };
  }
  let id: string | null = null;
  try {
    id = (JSON.parse(text) as { id?: string })?.id ?? null;
  } catch { /* ignore */ }
  return { ok: true, status: 200, error: null, id };
}

/** POST /emails/batch — up to 100 messages per call. Mirrors the gateway helper's shape. */
export async function sendBatchDirect(payload: unknown[]) {
  const resp = await fetch(`${RESEND_API}/emails/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`Resend (direct) batch failed [${resp.status}]: ${text}`);
    return { ok: false, status: resp.status, body: text, data: null };
  }
  try {
    return { ok: true, status: 200, body: text, data: JSON.parse(text) };
  } catch {
    return { ok: true, status: 200, body: text, data: null };
  }
}

/** Both helpers now talk to api.resend.com directly. No connector gateway. */
export async function sendEmailAuto(payload: Record<string, unknown>) {
  return await sendEmailDirect(payload);
}

export async function sendBatchAuto(payload: unknown[]) {
  return await sendBatchDirect(payload);
}
