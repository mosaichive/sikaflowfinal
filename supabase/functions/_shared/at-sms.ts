// SMS helper for KudiTrack.
//
// Default provider: Arkesel (https://arkesel.com) using the v2 REST API.
// Falls back to Africa's Talking only if ARKESEL_API_KEY is not set but
// legacy AT_USERNAME / AT_API_KEY are.
//
// Environment variables:
//   ARKESEL_API_KEY    - Arkesel API key (preferred provider)
//   ARKESEL_SENDER_ID  - Optional. Approved alphanumeric sender (<= 11 chars).
//                        If absent we use the Arkesel platform default sender
//                        "Arkesel" so delivery is not blocked while waiting
//                        for sender ID approval.
//
//   Legacy fallback only:
//     AT_USERNAME, AT_API_KEY, AT_SENDER_ID, AT_ALLOW_SANDBOX

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

function readSecret(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Arkesel v2 SMS
// ---------------------------------------------------------------------------

type ArkeselResponse = {
  status?: string;
  message?: string;
  data?: unknown;
  code?: string;
};

const ARKESEL_DEFAULT_SENDER = 'Arkesel';

function arkeselStatusToUserMessage(status: string | undefined, message: string | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'success') return 'Message accepted by carrier.';
  if (s === 'invalid_phone_number') return 'That phone number is not valid for SMS delivery.';
  if (s === 'insufficient_balance') return 'SMS provider has insufficient balance. Contact support.';
  if (s === 'invalid_sender') return 'SMS sender ID is not approved.';
  if (s === 'unauthorised' || s === 'unauthorized') {
    return 'SMS provider rejected our credentials. Please contact support.';
  }
  return message?.trim() || 'SMS gateway did not confirm delivery.';
}

async function sendArkeselSms(apiKey: string, to: string, message: string) {
  const configuredSender = readSecret('ARKESEL_SENDER_ID');
  // Sender ID is required by Arkesel; fall back to the platform default so a
  // missing/unapproved sender ID never blocks delivery.
  const sender = (configuredSender || ARKESEL_DEFAULT_SENDER).slice(0, 11);

  console.log('[arkesel-sms] preparing send', {
    apiKeyDetected: true,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: apiKey.slice(0, 4) + '…',
    senderIdConfigured: Boolean(configuredSender),
    senderUsed: sender,
    senderIsDefault: !configuredSender,
    to,
    messageLength: message.length,
  });

  let res: Response;
  let rawBodyText = '';
  let body: ArkeselResponse = {};
  try {
    res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        message,
        recipients: [to],
      }),
    });
    rawBodyText = await res.text();
    try {
      body = rawBodyText ? (JSON.parse(rawBodyText) as ArkeselResponse) : {};
    } catch {
      body = {};
    }
  } catch (err) {
    console.error('[arkesel-sms] network failure', {
      to,
      sender,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new SmsDeliveryError('Could not reach SMS provider. Please try again.');
  }

  const status = String(body?.status ?? '').toLowerCase();
  const providerMessage = String(body?.message ?? '').trim();

  if (!res.ok || (status && status !== 'success')) {
    console.error('[arkesel-sms] non-success response', {
      httpStatus: res.status,
      httpStatusText: res.statusText,
      providerStatus: body?.status ?? null,
      providerMessage: providerMessage || null,
      providerCode: body?.code ?? null,
      providerData: body?.data ?? null,
      rawBody: rawBodyText.slice(0, 500),
      sender,
      to,
    });
    const detail = providerMessage || rawBodyText.slice(0, 200) || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || status === 'unauthorised' || status === 'unauthorized') {
      throw new SmsConfigError(`Arkesel rejected our credentials (HTTP ${res.status}: ${detail}).`);
    }
    throw new SmsDeliveryError(
      `Arkesel ${arkeselStatusToUserMessage(body?.status, body?.message)} [HTTP ${res.status}: ${detail}]`,
      { httpStatus: res.status, body, rawBody: rawBodyText.slice(0, 500) },
    );
  }

  console.log('[arkesel-sms] queued', {
    httpStatus: res.status,
    to,
    sender,
    providerStatus: body?.status,
    providerMessage: providerMessage || null,
  });
  return body;
}

// ---------------------------------------------------------------------------
// Africa's Talking (legacy fallback)
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
  return candidates.some((value) => String(value ?? '').toLowerCase().includes('invalidsenderid'));
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

async function sendAfricasTalkingSms(to: string, message: string) {
  const username = readSecret('AT_USERNAME', 'AFRICASTALKING_USERNAME', 'AFRICAS_TALKING_USERNAME');
  const apiKey = readSecret('AT_API_KEY', 'AFRICASTALKING_API_KEY', 'AFRICAS_TALKING_API_KEY');
  const from = readSecret('AT_SENDER_ID', 'AFRICASTALKING_SENDER_ID', 'AFRICAS_TALKING_SENDER_ID');
  const allowSandbox = readSecret('AT_ALLOW_SANDBOX', 'AFRICASTALKING_ALLOW_SANDBOX', 'AFRICAS_TALKING_ALLOW_SANDBOX').toLowerCase() === 'true';

  if (!username || !apiKey) {
    console.error('[at-sms] missing AT_USERNAME or AT_API_KEY');
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

  const sendRequest = async (senderId: string) => {
    const params = new URLSearchParams({ username, to, message });
    if (senderId) params.set('from', senderId);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': apiKey,
        },
        body: params,
      });
      const body = await res.json().catch(() => ({} as AtResponseBody));
      return { res, body: body as AtResponseBody };
    } catch (err) {
      console.error('[at-sms] network failure', err);
      throw new SmsDeliveryError('Could not reach SMS provider. Please try again.');
    }
  };

  let senderUsed = from;
  let { res, body } = await sendRequest(senderUsed);
  let recipients: AtRecipient[] = body?.SMSMessageData?.Recipients ?? [];
  let recipient = recipients[0];

  if (senderUsed && isInvalidSenderId(body, recipient)) {
    senderUsed = '';
    ({ res, body } = await sendRequest(senderUsed));
    recipients = body?.SMSMessageData?.Recipients ?? [];
    recipient = recipients[0];
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new SmsConfigError('SMS provider rejected our credentials. Please contact support.');
    }
    throw new SmsDeliveryError('SMS provider could not accept the message.');
  }
  if (!recipient) {
    throw new SmsDeliveryError('SMS provider did not queue the message.', body);
  }
  if (recipient.status && recipient.status !== 'Success') {
    throw new SmsDeliveryError(atRecipientStatusToUserMessage(recipient.status), recipient);
  }
  console.log('[at-sms] queued', { to: recipient.number, status: recipient.status });
  return body;
}

// ---------------------------------------------------------------------------
// Public entry point (name kept for backwards compatibility with callers)
// ---------------------------------------------------------------------------

export async function sendAtSms(to: string, message: string) {
  const arkeselKey = readSecret('ARKESEL_API_KEY');
  const atKey = readSecret('AT_API_KEY', 'AFRICASTALKING_API_KEY', 'AFRICAS_TALKING_API_KEY');
  console.log('[sms] dispatch', {
    to,
    arkeselKeyDetected: Boolean(arkeselKey),
    atKeyDetected: Boolean(atKey),
    provider: arkeselKey ? 'arkesel' : (atKey ? 'africastalking' : 'none'),
  });
  if (arkeselKey) {
    return await sendArkeselSms(arkeselKey, to, message);
  }
  // Fallback: legacy Africa's Talking credentials.
  return await sendAfricasTalkingSms(to, message);
}

export const sendSms = sendAtSms;

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
