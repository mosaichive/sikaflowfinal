import { describe, expect, it } from 'vitest';
import { getVisibleMobileNavItems } from '@/lib/mobile-nav';
import type { ModuleKey } from '@/lib/permissions';

const Icon = () => null;

describe('getVisibleMobileNavItems', () => {
  it('shows only assigned module links plus always-visible settings', () => {
    const items = [
      { to: '/dashboard', label: 'Home', icon: Icon, module: 'dashboard' as ModuleKey },
      { to: '/sales', label: 'POS', icon: Icon, module: 'sales' as ModuleKey },
      { to: '/orders', label: 'Orders', icon: Icon, module: 'orders' as ModuleKey },
      { to: '/expenses', label: 'Expenses', icon: Icon, module: 'expenses' as ModuleKey },
      { to: '/settings', label: 'Settings', icon: Icon, alwaysVisible: true },
    ];

    const visible = getVisibleMobileNavItems(
      items,
      (module) => module === 'dashboard' || module === 'expenses',
    );

    expect(visible.map((item) => item.label)).toEqual(['Home', 'Expenses', 'Settings']);
  });
});
