import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';

export type SmsContactInput = {
  phone: string;
  contactName?: string;
  businessName?: string;
  city?: string;
  region?: string;
  category?: string;
  notes?: string;
};

export type ParsedRecipient = SmsContactInput & {
  normalized: string | null;
  validity: 'valid' | 'invalid' | 'duplicate';
};

export type SmsMetrics = {
  encoding: 'gsm7' | 'ucs2';
  characters: number;
  units: number;
  segments: number;
};

const GSM_BASIC = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
));
const GSM_EXTENSION = new Set(Array.from('\f^{}\\[~]|€'));

const PHONE_HEADERS = new Set([
  'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber',
  'telephone', 'tel', 'number', 'smsnumber', 'whatsapp', 'publiccontact',
  'businesscontact', 'contactphone', 'primaryphone',
]);
const NAME_HEADERS = new Set(['name', 'contactname', 'fullname', 'customername', 'ownername']);
const BUSINESS_HEADERS = new Set(['business', 'businessname', 'company', 'companyname', 'shopname']);
const CITY_HEADERS = new Set(['city', 'town', 'area', 'cityarea']);
const REGION_HEADERS = new Set(['region', 'state', 'province']);
const CATEGORY_HEADERS = new Set(['category', 'type', 'segment', 'businesstype']);
const NOTES_HEADERS = new Set(['notes', 'note', 'comments']);
const FIT_HEADERS = new Set(['fit', 'kuditrackfit']);

function canonicalHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function valueAt(row: unknown[], headers: string[], accepted: Set<string>) {
  const index = headers.findIndex((header) => accepted.has(header));
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function splitSpreadsheetPhones(value: unknown): string[] {
  const phone = String(value ?? '').trim();
  if (!phone) return [''];

  const phones = phone
    .split(/[;/|\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return phones.length > 0 ? phones : [phone];
}

export function normalizeSmsPhone(raw: unknown): string | null {
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

export function smsCountryCode(normalized: string): string | null {
  if (normalized.startsWith('+233')) return '+233';
  if (normalized.startsWith('+1')) return '+1';
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized.slice(0, Math.min(4, normalized.length - 7)) : null;
}

export function splitManualRecipients(value: string): SmsContactInput[] {
  return value
    .split(/[;,\n\r]+/)
    .map((phone) => phone.trim())
    .filter(Boolean)
    .map((phone) => ({ phone }));
}

export function analyzeRecipients(rows: SmsContactInput[]): ParsedRecipient[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const normalized = normalizeSmsPhone(row.phone);
    if (!normalized) return { ...row, normalized: null, validity: 'invalid' as const };
    if (seen.has(normalized)) return { ...row, normalized, validity: 'duplicate' as const };
    seen.add(normalized);
    return { ...row, normalized, validity: 'valid' as const };
  });
}

export function getSmsMetrics(message: string): SmsMetrics {
  const characters = Array.from(message).length;
  let gsmUnits = 0;
  let gsm = true;
  for (const char of Array.from(message)) {
    if (GSM_BASIC.has(char)) gsmUnits += 1;
    else if (GSM_EXTENSION.has(char)) gsmUnits += 2;
    else {
      gsm = false;
      break;
    }
  }

  if (gsm) {
    return {
      encoding: 'gsm7',
      characters,
      units: gsmUnits,
      segments: gsmUnits === 0 ? 0 : gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153),
    };
  }

  const unicodeUnits = Array.from(message).reduce(
    (sum, char) => sum + (char.codePointAt(0)! > 0xffff ? 2 : 1),
    0,
  );
  return {
    encoding: 'ucs2',
    characters,
    units: unicodeUnits,
    segments: unicodeUnits === 0 ? 0 : unicodeUnits <= 70 ? 1 : Math.ceil(unicodeUnits / 67),
  };
}

export function matrixToContacts(input: unknown): SmsContactInput[] {
  if (!Array.isArray(input) || !input.every(Array.isArray)) {
    throw new Error('The spreadsheet does not contain a readable row table.');
  }

  const matrix = input as unknown[][];
  if (matrix.length < 2) throw new Error('The file must include a header row and at least one contact.');
  const headers = matrix[0].map(canonicalHeader);
  const phoneIndex = headers.findIndex((header) => PHONE_HEADERS.has(header));
  if (phoneIndex < 0) {
    throw new Error('No phone column was found. Use a heading such as phone, phone_number, mobile, or contact.');
  }

  return matrix.slice(1).flatMap((row) => {
    const phoneCell = String(row[phoneIndex] ?? '').trim();
    if (!phoneCell && row.every((cell) => String(cell ?? '').trim() === '')) return [];

    const notes = [
      valueAt(row, headers, FIT_HEADERS),
      valueAt(row, headers, NOTES_HEADERS),
    ].filter(Boolean).join(' - ');
    const metadata = {
      contactName: valueAt(row, headers, NAME_HEADERS) || undefined,
      businessName: valueAt(row, headers, BUSINESS_HEADERS) || undefined,
      city: valueAt(row, headers, CITY_HEADERS) || undefined,
      region: valueAt(row, headers, REGION_HEADERS) || undefined,
      category: valueAt(row, headers, CATEGORY_HEADERS) || undefined,
      notes: notes || undefined,
    };

    return splitSpreadsheetPhones(phoneCell).map((phone) => ({ phone, ...metadata }));
  });
}

export async function parseContactFile(file: File): Promise<SmsContactInput[]> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Contact files are limited to 8 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx') {
    const rows = await readSheet(file);
    return matrixToContacts(rows);
  }
  if (extension !== 'csv') throw new Error('Upload a CSV or XLSX file.');

  const text = await file.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(result.errors[0].message);
  return matrixToContacts(result.data as unknown[][]);
}

export function contactsToCsv(rows: Array<Record<string, unknown>>): string {
  return Papa.unparse(rows, { newline: '\r\n' });
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([contactsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
