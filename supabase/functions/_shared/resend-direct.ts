// Resend transport that talks to api.resend.com DIRECTLY (no Lovable connector gateway).
//
// STATUS: PREPARED FOR MIGRATION — NOT WIRED INTO PRODUCTION YET.
// Production code (admin-email-send-campaign, admin-monthly-statements) still calls the
// Lovable connector gateway. After production cutover, replace their local `sendEmail` /
// `sendBatch` helpers with `sendEmailDirect` / `sendBatchDirect` below. The return shapes
// are intentionally identical to the current gateway helpers, so the swap is a one-line
// change in each function.
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

/** True once the project is cut over and should bypass the Lovable connector gateway. */
export function useDirectResend(): boolean {
  return (Deno.env.get("EMAIL_TRANSPORT") ?? "gateway").toLowerCase() === "direct";
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

/**
 * Optional convenience wrappers: keep BOTH transports available during cutover so a
 * rollback needs no code change — only the EMAIL_TRANSPORT env var flips.
 */
const LOVABLE_GATEWAY = "https://connector-gateway.lovable.dev/resend";

async function viaGateway(path: string, body: unknown) {
  return await fetch(`${LOVABLE_GATEWAY}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
      "X-Connection-Api-Key": Deno.env.get("RESEND_API_KEY") ?? "",
    },
    body: JSON.stringify(body),
  });
}

export async function sendEmailAuto(payload: Record<string, unknown>) {
  if (useDirectResend()) return await sendEmailDirect(payload);
  const resp = await viaGateway("/emails", payload);
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status: resp.status, error: text, id: null as string | null };
  let id: string | null = null;
  try { id = (JSON.parse(text) as { id?: string })?.id ?? null; } catch { /* ignore */ }
  return { ok: true, status: 200, error: null, id };
}

export async function sendBatchAuto(payload: unknown[]) {
  if (useDirectResend()) return await sendBatchDirect(payload);
  const resp = await viaGateway("/emails/batch", payload);
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status: resp.status, body: text, data: null };
  try { return { ok: true, status: 200, body: text, data: JSON.parse(text) }; }
  catch { return { ok: true, status: 200, body: text, data: null }; }
}
