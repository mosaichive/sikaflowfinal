// Africa's Talking SMS helper for KudiTrack OTP delivery.
//
// Configuration is read from environment variables:
//   AT_USERNAME  - Africa's Talking username ("sandbox" for the test gateway)
//   AT_API_KEY   - Africa's Talking API key
//   AT_SENDER_ID - Optional alphanumeric / short-code sender (must be approved
//                  for production traffic in Ghana; see NCA registration).
//   AT_ALLOW_SANDBOX - "true" to permit the sandbox gateway. Without this flag
//                      we refuse to "send" via sandbox because messages never
//                      reach real handsets, which is the #1 cause of the
//                      "code says sent but no SMS received" bug.

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

type AtRecipient = {
  statusCode?: number;
  status?: string;
  number?: string;
  cost?: string;
  messageId?: string;
};

function recipientStatusToUserMessage(status: string | undefined): string {
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

export async function sendAtSms(to: string, message: string) {
  const username = Deno.env.get('AT_USERNAME');
  const apiKey = Deno.env.get('AT_API_KEY');
  const from = Deno.env.get('AT_SENDER_ID') || '';
  const allowSandbox = (Deno.env.get('AT_ALLOW_SANDBOX') || '').toLowerCase() === 'true';

  if (!username || !apiKey) {
    console.error('[at-sms] missing AT_USERNAME or AT_API_KEY');
    throw new SmsConfigError('SMS provider is not configured. Please contact support.');
  }

  const isSandbox = username === 'sandbox';
  if (isSandbox && !allowSandbox) {
    console.error('[at-sms] refusing to send via sandbox account (AT_USERNAME=sandbox)');
    throw new SmsConfigError(
      'SMS provider is in sandbox mode and cannot deliver real messages. Please contact support.',
    );
  }

  const endpoint = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams({ username, to, message });
  if (from) params.set('from', from);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
      },
      body: params,
    });
  } catch (err) {
    console.error('[at-sms] network failure calling Africa\'s Talking:', err);
    throw new SmsDeliveryError('Could not reach SMS provider. Please try again.');
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('[at-sms] non-2xx from Africa\'s Talking', { status: res.status, body });
    // 401/403 indicates auth/config failure, not a transient delivery problem.
    if (res.status === 401 || res.status === 403) {
      throw new SmsConfigError('SMS provider rejected our credentials. Please contact support.');
    }
    throw new SmsDeliveryError('SMS provider could not accept the message.');
  }

  const recipients: AtRecipient[] = body?.SMSMessageData?.Recipients ?? [];
  const recipient = recipients[0];

  // Africa's Talking returns 200 OK with Recipients=[] when nothing was queued
  // (e.g. sandbox account sending to a non-whitelisted number, blacklisted MSISDN,
  // or zero-balance accounts in production). Treat that as a hard failure so we
  // never tell the user "code sent" when nothing actually went out.
  if (!recipient) {
    const apiMessage = String(body?.SMSMessageData?.Message ?? '').trim();
    console.error('[at-sms] empty Recipients from AT', { to, body });
    throw new SmsDeliveryError(
      apiMessage
        ? `SMS provider did not queue the message: ${apiMessage}`
        : 'SMS provider did not queue the message. Try again or use email.',
      body,
    );
  }

  if (recipient.status && recipient.status !== 'Success') {
    console.error('[at-sms] recipient rejected', { to, recipient });
    throw new SmsDeliveryError(recipientStatusToUserMessage(recipient.status), recipient);
  }

  // Success — log enough to debug carrier-side drops without leaking the OTP.
  console.log('[at-sms] queued', {
    to: recipient.number,
    status: recipient.status,
    cost: recipient.cost,
    messageId: recipient.messageId,
    sender: from || '(default)',
    sandbox: isSandbox,
  });

  return body;
}

export function normalizePhone(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) {
    // strip stray non-digits after the +
    return '+' + p.slice(1).replace(/\D/g, '');
  }
  // Ghana default: 10 digits starting with 0 -> +233XXXXXXXXX
  if (/^0\d{9}$/.test(p)) return '+233' + p.slice(1);
  // Bare Ghana 9-digit mobile (24xxxxxxx) -> +233XXXXXXXXX
  if (/^[2-5]\d{8}$/.test(p)) return '+233' + p;
  if (/^\d{9,15}$/.test(p)) return '+' + p;
  return p;
}

export async function hashCode(code: string, salt = 'kuditrack-otp'): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
