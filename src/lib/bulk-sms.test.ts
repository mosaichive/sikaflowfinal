import { describe, expect, it } from 'vitest';
import { analyzeRecipients, getSmsMetrics, matrixToContacts, normalizeSmsPhone, splitManualRecipients } from './bulk-sms';

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

  it('requires a recognizable phone column', () => {
    expect(() => matrixToContacts([['Name', 'Email'], ['Ama', 'ama@example.com']]))
      .toThrow(/No phone column/);
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
