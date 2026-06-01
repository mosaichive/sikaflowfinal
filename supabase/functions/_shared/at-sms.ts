// Africa's Talking SMS helper
export async function sendAtSms(to: string, message: string) {
  const username = Deno.env.get('AT_USERNAME');
  const apiKey = Deno.env.get('AT_API_KEY');
  const from = Deno.env.get('AT_SENDER_ID') || '';
  if (!username || !apiKey) throw new Error('SMS is not configured');

  const endpoint = username === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams({ username, to, message });
  if (from) params.set('from', from);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey': apiKey,
    },
    body: params,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Africa\'s Talking error:', body);
    throw new Error('Failed to send SMS');
  }
  const recipient = body?.SMSMessageData?.Recipients?.[0];
  if (recipient && recipient.status && recipient.status !== 'Success') {
    console.error('AT recipient failure:', recipient);
    throw new Error(`SMS not delivered: ${recipient.status}`);
  }
  return body;
}

export function normalizePhone(raw: string): string {
  const p = String(raw || '').trim().replace(/\s+/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return p;
  // Ghana default if 10 digits starting with 0
  if (/^0\d{9}$/.test(p)) return '+233' + p.slice(1);
  if (/^\d{9,15}$/.test(p)) return '+' + p;
  return p;
}

export async function hashCode(code: string, salt = 'kuditrack-otp'): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
