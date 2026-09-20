export type BulkSmsContact = {
  phone: string;
  contactName?: string | null;
  businessName?: string | null;
  externalContactId?: string | null;
  optedOut?: boolean;
};

const GSM_BASIC = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
));
const GSM_EXTENSION = new Set(Array.from('\f^{}\\[~]|€'));

export function normalizeExternalPhone(raw: unknown): string | null {
  const input = String(raw ?? '').trim();
  if (!input || /[a-z]/i.test(input)) return null;
  if ((input.match(/\+/g) ?? []).length > 1 || (input.includes('+') && !input.startsWith('+'))) return null;
  let compact = input.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  if (!/^\+?\d+$/.test(compact)) return null;
  if (/^0\d{9}$/.test(compact)) compact = `+233${compact.slice(1)}`;
  else if (/^[2-5]\d{8}$/.test(compact)) compact = `+233${compact}`;
  else if (/^233\d{9}$/.test(compact)) compact = `+${compact}`;
  else if (!compact.startsWith('+')) compact = `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export function getSmsMetrics(message: string) {
  const characters = Array.from(message).length;
  let units = 0;
  for (const char of Array.from(message)) {
    if (GSM_BASIC.has(char)) units += 1;
    else if (GSM_EXTENSION.has(char)) units += 2;
    else {
      const unicodeUnits = Array.from(message).reduce(
        (total, value) => total + (value.codePointAt(0)! > 0xffff ? 2 : 1),
        0,
      );
      return {
        encoding: 'ucs2' as const,
        characters,
        units: unicodeUnits,
        segments: unicodeUnits === 0 ? 0 : unicodeUnits <= 70 ? 1 : Math.ceil(unicodeUnits / 67),
      };
    }
  }
  return {
    encoding: 'gsm7' as const,
    characters,
    units,
    segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153),
  };
}

export function boundedText(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

