import { describe, expect, it } from 'vitest';
import { resolveStaffModules } from '@/lib/staff-permissions';

describe('resolveStaffModules', () => {
  it('keeps an explicit empty module assignment empty', () => {
    expect(resolveStaffModules('manager', [])).toEqual([]);
  });

  it('falls back to role presets only when modules are missing', () => {
    expect(resolveStaffModules('salesperson', undefined)).toEqual([
      'dashboard',
      'sales',
      'customers',
      'orders',
      'announcements',
    ]);
  });

  it('includes damaged goods in the manager default preset', () => {
    expect(resolveStaffModules('manager', undefined)).toContain('damaged_goods');
  });

  it('drops unknown module values from stored permissions', () => {
    expect(resolveStaffModules('staff', ['sales', 'unknown', 'expenses'])).toEqual(['sales', 'expenses']);
  });
});
