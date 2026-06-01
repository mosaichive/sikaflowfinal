import { describe, expect, it } from 'vitest';
import { getMobileNavLayout, getVisibleMobileNavItems } from '@/lib/mobile-nav';
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

  it('does not show More when assigned links fit in the mobile nav', () => {
    const items = [
      { to: '/dashboard', label: 'Home', icon: Icon, module: 'dashboard' as ModuleKey },
      { to: '/sales', label: 'POS', icon: Icon, module: 'sales' as ModuleKey },
      { to: '/expenses', label: 'Expenses', icon: Icon, module: 'expenses' as ModuleKey },
      { to: '/announcements', label: 'Announcements', icon: Icon, module: 'announcements' as ModuleKey },
      { to: '/settings', label: 'Settings', icon: Icon, alwaysVisible: true },
    ];

    const layout = getMobileNavLayout(
      items,
      (module) => ['dashboard', 'sales', 'expenses', 'announcements'].includes(module),
      5,
    );

    expect(layout.showMore).toBe(false);
    expect(layout.primaryItems.map((item) => item.label)).toEqual(['Home', 'POS', 'Expenses', 'Announcements', 'Settings']);
    expect(layout.overflowItems).toEqual([]);
  });

  it('uses More only for links that exceed the mobile nav capacity', () => {
    const items = [
      { to: '/dashboard', label: 'Home', icon: Icon, module: 'dashboard' as ModuleKey },
      { to: '/sales', label: 'POS', icon: Icon, module: 'sales' as ModuleKey },
      { to: '/orders', label: 'Orders', icon: Icon, module: 'orders' as ModuleKey },
      { to: '/inventory', label: 'Inventory', icon: Icon, module: 'inventory' as ModuleKey },
      { to: '/expenses', label: 'Expenses', icon: Icon, module: 'expenses' as ModuleKey },
      { to: '/reports', label: 'Reports', icon: Icon, module: 'reports' as ModuleKey },
      { to: '/settings', label: 'Settings', icon: Icon, alwaysVisible: true },
    ];

    const layout = getMobileNavLayout(items, () => true, 5);

    expect(layout.showMore).toBe(true);
    expect(layout.primaryItems.map((item) => item.label)).toEqual(['Home', 'POS', 'Orders', 'Inventory']);
    expect(layout.overflowItems.map((item) => item.label)).toEqual(['Expenses', 'Reports', 'Settings']);
  });
});
