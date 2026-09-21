import { describe, expect, it } from 'vitest';
import {
  analyzeEmailRecipients,
  analyzeRecipients,
  getSmsMetrics,
  matrixToContacts,
  normalizeEmailAddress,
  normalizeSmsPhone,
  splitManualRecipients,
  suggestedContactListName,
} from './bulk-sms';

describe('normalizeSmsPhone', () => {
  it.each([
    ['0241234567', '+233241234567'],
    ['233241234567', '+233241234567'],
    ['+233241234567', '+233241234567'],
    ['024 123 4567', '+233241234567'],
    ['00442079460000', '+442079460000'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeSmsPhone(input)).toBe(expected);
  });

  it.each(['', '123', 'phone', '+233+241234567', '0241234567899'])('rejects %s', (input) => {
    expect(normalizeSmsPhone(input)).toBeNull();
  });
});

describe('recipient parsing', () => {
  it('supports comma, semicolon, and new-line separators and flags duplicates', () => {
    const rows = analyzeRecipients(splitManualRecipients('0241234567, 0551234567;\n+233241234567'));
    expect(rows.map((row) => row.validity)).toEqual(['valid', 'valid', 'duplicate']);
  });

  it('detects common spreadsheet columns and keeps contact metadata', () => {
    expect(matrixToContacts([
      ['Business Name', 'Mobile Number', 'Contact Name', 'Region'],
      ['Kojo Stores', '0241234567', 'Kojo Mensah', 'Greater Accra'],
    ])).toEqual([{
      phone: '0241234567',
      contactName: 'Kojo Mensah',
      businessName: 'Kojo Stores',
      region: 'Greater Accra',
    }]);
  });

  it('supports KudiTrack prospect workbook headers and multiple numbers in one cell', () => {
    expect(matrixToContacts([
      ['Business Name', 'Business Type', 'City / Area', 'Region', 'Public Contact', 'KudiTrack Fit', 'Notes'],
      ['Kojo Stores', 'Retail', 'Osu', 'Greater Accra', '0241234567 / +233551234567', 'Strong fit', 'Call mornings'],
    ])).toEqual([
      {
        phone: '0241234567',
        businessName: 'Kojo Stores',
        city: 'Osu',
        region: 'Greater Accra',
        category: 'Retail',
        notes: 'Strong fit - Call mornings',
      },
      {
        phone: '+233551234567',
        businessName: 'Kojo Stores',
        city: 'Osu',
        region: 'Greater Accra',
        category: 'Retail',
        notes: 'Strong fit - Call mornings',
      },
    ]);
  });

  it('extracts and deduplicates email addresses separately from phone numbers', () => {
    const rows = matrixToContacts([
      ['Business Name', 'Phone', 'Email Address', 'Contact Name'],
      ['Kojo Stores', '0241234567 / 0551234567', 'Sales@Kojo.example; owner@kojo.example', 'Kojo Mensah'],
    ]);

    expect(analyzeRecipients(rows).map((row) => row.validity)).toEqual(['valid', 'valid']);
    expect(analyzeEmailRecipients(rows)).toEqual([
      expect.objectContaining({ email: 'Sales@Kojo.example', normalizedEmail: 'sales@kojo.example', validity: 'valid' }),
      expect.objectContaining({ email: 'owner@kojo.example', normalizedEmail: 'owner@kojo.example', validity: 'valid' }),
      expect.objectContaining({ email: 'Sales@Kojo.example', normalizedEmail: 'sales@kojo.example', validity: 'duplicate' }),
      expect.objectContaining({ email: 'owner@kojo.example', normalizedEmail: 'owner@kojo.example', validity: 'duplicate' }),
    ]);
  });

  it('keeps email-only rows for the external email audience', () => {
    const rows = matrixToContacts([
      ['Business Name', 'Business Email'],
      ['Ama Foods', 'hello@amafoods.com'],
    ]);

    expect(rows).toEqual([{ phone: '', email: 'hello@amafoods.com', businessName: 'Ama Foods' }]);
    expect(analyzeRecipients(rows)[0].validity).toBe('invalid');
    expect(analyzeEmailRecipients(rows)[0]).toMatchObject({
      normalizedEmail: 'hello@amafoods.com',
      validity: 'valid',
    });
  });

  it('requires a recognizable phone or email column', () => {
    expect(() => matrixToContacts([['Name', 'Website'], ['Ama', 'https://example.com']]))
      .toThrow(/No phone or email column/);
  });

  it('rejects workbook-shaped data with a readable error', () => {
    expect(() => matrixToContacts([{ sheet: 'Contacts', data: [['Phone'], ['0241234567']] }]))
      .toThrow(/readable row table/);
  });

  it('creates a readable contact-list name from an uploaded filename', () => {
    expect(suggestedContactListName('KudiTrack_Ghana_Prospect_Contacts.xlsx'))
      .toBe('KudiTrack Ghana Prospect Contacts');
    expect(suggestedContactListName('contacts.csv')).toBe('contacts');
  });
});

describe('normalizeEmailAddress', () => {
  it.each([
    [' Owner@Example.COM ', 'owner@example.com'],
    ['sales+ghana@example.co.uk', 'sales+ghana@example.co.uk'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeEmailAddress(input)).toBe(expected);
  });

  it.each(['', 'not-an-email', 'a@b', 'a..b@example.com'])('rejects %s', (input) => {
    expect(normalizeEmailAddress(input)).toBeNull();
  });
});

describe('SMS segment metrics', () => {
  it('counts GSM single and concatenated messages', () => {
    expect(getSmsMetrics('a'.repeat(160)).segments).toBe(1);
    expect(getSmsMetrics('a'.repeat(161)).segments).toBe(2);
  });

  it('counts GSM extension characters as two units', () => {
    expect(getSmsMetrics('^'.repeat(81))).toMatchObject({ encoding: 'gsm7', units: 162, segments: 2 });
  });

  it('uses UCS-2 limits for Unicode', () => {
    expect(getSmsMetrics('✓'.repeat(70))).toMatchObject({ encoding: 'ucs2', segments: 1 });
    expect(getSmsMetrics('✓'.repeat(71))).toMatchObject({ encoding: 'ucs2', segments: 2 });
  });
});
