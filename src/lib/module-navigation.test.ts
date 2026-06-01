import { describe, expect, it } from 'vitest';
import { getFirstAssignedModulePath } from '@/lib/module-navigation';
import type { ModuleKey } from '@/lib/permissions';

describe('getFirstAssignedModulePath', () => {
  it('uses Dashboard when Dashboard/Home is assigned', () => {
    expect(getFirstAssignedModulePath(['sales', 'dashboard'])).toBe('/dashboard');
  });

  it('falls back to Sales/POS when Dashboard/Home is not assigned', () => {
    expect(getFirstAssignedModulePath(['sales'])).toBe('/sales');
  });

  it('uses the first route-order assigned section when Dashboard/Home is missing', () => {
    expect(getFirstAssignedModulePath(['expenses', 'sales', 'reports'])).toBe('/sales');
  });

  it('supports a single non-dashboard assigned section', () => {
    expect(getFirstAssignedModulePath(['inventory'])).toBe('/inventory');
  });

  it('returns null when no sections are assigned', () => {
    expect(getFirstAssignedModulePath([] as ModuleKey[])).toBeNull();
  });
});
