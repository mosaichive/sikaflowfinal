// Centralized SMS service for KudiTrack.
//
// Provider: Africa's Talking (https://africastalking.com).
//
// Environment variables:
//   AT_USERNAME    - Africa's Talking username ("sandbox" for the sandbox env)
//   AT_API_KEY     - Africa's Talking API key
//   AT_SENDER_ID   - Optional approved alphanumeric/short-code sender ID.
//                    If empty, Africa's Talking uses the account default
//                    sender (no `from` field is sent). We only log a warning.
//   SMS_ENABLED    - "false" to disable outbound delivery globally. When
//                    disabled, sendSms() logs the intended payload and
//                    resolves successfully (dry-run); no provider call is made.
//   AT_ALLOW_SANDBOX - "true" to permit the sandbox username to attempt
//                      real sends (otherwise sandbox is treated as config error).
//
// Public API:
//   sendSms({ to, message, senderId? }) -> Promise<SmsSendResult>
//   sendAtSms(to, message)              -> Promise<SmsSendResult>  (legacy alias)
//   normalizePhone(raw)                 -> string
//   hashCode(code, salt?)               -> Promise<string>
//
// Errors:
//   SmsConfigError   - missing credentials / unrecoverable config issue
//   SmsDeliveryError - provider accepted the call but rejected the message,
//                      or the network call failed after retries.

export class SmsConfigError extends Error {
  readonly kind = 'config' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SmsConfigError';
  }
}

export class SmsDeliveryError extends Error {
  readonly kind = 'delivery' as const;
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}

export type SmsSendArgs = {
  to: string;
  message: string;
  senderId?: string;
};

export type SmsSendResult = {
  ok: true;
  provider: 'africastalking';
  delivered: boolean;        // true when actually dispatched; false in dry-run
  dryRun: boolean;
  recipient?: AtRecipient;
  raw?: unknown;
};

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function readSecret(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return '';
}

function smsEnabled() {
  const raw = (Deno.env.get('SMS_ENABLED') ?? '').trim().toLowerCase();
  // Default ON when unset, so behaviour is unchanged once credentials exist.
  if (!raw) return true;
  return !(raw === 'false' || raw === '0' || raw === 'no' || raw === 'off');
}

// ---------------------------------------------------------------------------
// Africa's Talking response types & helpers
// ---------------------------------------------------------------------------

type AtRecipient = {
  statusCode?: number;
  status?: string;
  number?: string;
  cost?: string;
  messageId?: string;
};

type AtResponseBody = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AtRecipient[];
  };
  description?: string;
  message?: string;
  errorMessage?: string;
};

function isInvalidSenderId(body: AtResponseBody, recipient?: AtRecipient) {
  const candidates = [
    body?.SMSMessageData?.Message,
    body?.description,
    body?.message,
    body?.errorMessage,
    recipient?.status,
  ];
  return candidates.some((v) => String(v ?? '').toLowerCase().includes('invalidsenderid'));
}

function atRecipientStatusToUserMessage(status: string | undefined): string {
  switch ((status || '').trim()) {
    case 'Success':
    case 'Sent':
      return 'Message accepted by carrier.';
    case 'InvalidPhoneNumber':
      return 'That phone number is not valid for SMS delivery.';
    case 'UserInBlacklist':
      return 'That phone number has opted out of SMS from this sender.';
    case 'InsufficientBalance':
      return 'SMS provider has insufficient balance. Contact support.';
    case 'UserIsInactive':
      return 'That phone number is inactive on the carrier.';
    case 'CouldNotRoute':
      return 'Could not route SMS to that number.';
    case 'InternalServerError':
    case 'GatewayError':
      return 'SMS gateway error. Please try again in a moment.';
    case '':
    case undefined:
      return 'SMS gateway did not confirm delivery.';
    default:
      return `SMS gateway rejected the message (${status}).`;
  }
}

// ---------------------------------------------------------------------------
// Core dispatch (with one retry on transient/network errors)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

async function postOnce(endpoint: string, username: string, apiKey: string, to: string, message: string, senderId: string) {
  const params = new URLSearchParams({ username, to, message });
  if (senderId) params.set('from', senderId);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey,
    },
    body: params,
  });
  const body = (await res.json().catch(() => ({}))) as AtResponseBody;
  return { res, body };
}

async function postWithRetry(endpoint: string, username: string, apiKey: string, to: string, message: string, senderId: string) {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await postOnce(endpoint, username, apiKey, to, message, senderId);
      // Retry only on 5xx
      if (result.res.status >= 500 && attempt < MAX_ATTEMPTS) {
        console.warn('[sms] transient provider 5xx, will retry', {
          attempt, httpStatus: result.res.status,
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      console.warn('[sms] network error, may retry', {
        attempt, error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
    }
  }
  throw new SmsDeliveryError(
    'Could not reach SMS provider. Please try again.',
    lastErr instanceof Error ? lastErr.message : String(lastErr),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendSms(args: SmsSendArgs): Promise<SmsSendResult> {
  const to = String(args.to ?? '').trim();
  const message = String(args.message ?? '');
  if (!to) throw new SmsConfigError('Missing recipient phone number.');
  if (!message) throw new SmsConfigError('Missing SMS message body.');

  const username = readSecret('AT_USERNAME');
  const apiKey = readSecret('AT_API_KEY');
  const envSender = readSecret('AT_SENDER_ID');
  const senderId = (args.senderId ?? envSender ?? '').trim();
  const allowSandbox = readSecret('AT_ALLOW_SANDBOX').toLowerCase() === 'true';
  const enabled = smsEnabled();

  if (!senderId) {
    console.warn('[sms] AT_SENDER_ID is not configured — using Africa\'s Talking default sender');
  }

  console.log('[sms] dispatch', {
    provider: 'africastalking',
    to,
    senderId: senderId || '(default)',
    messageLength: message.length,
    smsEnabled: enabled,
    atUsernameDetected: Boolean(username),
    atApiKeyDetected: Boolean(apiKey),
  });

  if (!enabled) {
    console.log('[sms] SMS_ENABLED=false — dry run, not dispatching', { to });
    return { ok: true, provider: 'africastalking', delivered: false, dryRun: true };
  }

  if (!username || !apiKey) {
    throw new SmsConfigError('SMS provider is not configured. Please contact support.');
  }

  const isSandbox = username === 'sandbox';
  if (isSandbox && !allowSandbox) {
    throw new SmsConfigError(
      'SMS provider is in sandbox mode and cannot deliver real messages. Please contact support.',
    );
  }

  const endpoint = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  // First attempt with configured sender (if any).
  let { res, body } = await postWithRetry(endpoint, username, apiKey, to, message, senderId);
  let recipients = body?.SMSMessageData?.Recipients ?? [];
  let recipient = recipients[0];

  // If the sender ID was rejected, retry once without it (use AT default).
  if (senderId && isInvalidSenderId(body, recipient)) {
    console.warn('[sms] sender id rejected — retrying with default sender', { senderId });
    ({ res, body } = await postWithRetry(endpoint, username, apiKey, to, message, ''));
    recipients = body?.SMSMessageData?.Recipients ?? [];
    recipient = recipients[0];
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new SmsConfigError('SMS provider rejected our credentials. Please contact support.');
    }
    console.error('[sms] non-2xx from provider', { httpStatus: res.status, body });
    throw new SmsDeliveryError('SMS provider could not accept the message.', body);
  }
  if (!recipient) {
    console.error('[sms] no recipient in provider response', body);
    throw new SmsDeliveryError('SMS provider did not queue the message.', body);
  }
  if (recipient.status && recipient.status !== 'Success') {
    throw new SmsDeliveryError(atRecipientStatusToUserMessage(recipient.status), recipient);
  }

  console.log('[sms] queued', {
    to: recipient.number,
    status: recipient.status,
    messageId: recipient.messageId,
    cost: recipient.cost,
  });
  return {
    ok: true,
    provider: 'africastalking',
    delivered: true,
    dryRun: false,
    recipient,
    raw: body,
  };
}

// Legacy alias kept so existing edge functions don't need touching.
export async function sendAtSms(to: string, message: string) {
  return await sendSms({ to, message });
}

// ---------------------------------------------------------------------------
// Phone & misc utilities (unchanged — used by auth/OTP flows too)
// ---------------------------------------------------------------------------

export function normalizePhone(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) {
    return '+' + p.slice(1).replace(/\D/g, '');
  }
  if (/^0\d{9}$/.test(p)) return '+233' + p.slice(1);
  if (/^[2-5]\d{8}$/.test(p)) return '+233' + p;
  if (/^\d{9,15}$/.test(p)) return '+' + p;
  return p;
}

export async function hashCode(code: string, salt = 'kuditrack-otp'): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
