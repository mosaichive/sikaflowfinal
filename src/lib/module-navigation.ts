import type { ModuleKey } from '@/lib/permissions';

export type ModuleRoute = {
  module: ModuleKey;
  path: string;
  label: string;
};

export const STAFF_LANDING_ROUTES: readonly ModuleRoute[] = [
  { module: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { module: 'sales', path: '/sales', label: 'Sales / POS' },
  { module: 'products', path: '/products', label: 'Products' },
  { module: 'inventory', path: '/inventory', label: 'Inventory' },
  { module: 'damaged_goods', path: '/damaged-goods', label: 'Damaged Goods' },
  { module: 'customers', path: '/customers', label: 'Customers' },
  { module: 'orders', path: '/orders', label: 'Orders' },
  { module: 'other_income', path: '/other-income', label: 'Other Income' },
  { module: 'expenses', path: '/expenses', label: 'Expenses' },
  { module: 'savings', path: '/savings', label: 'Savings' },
  { module: 'reports', path: '/reports', label: 'Reports' },
  { module: 'staff', path: '/staff', label: 'Team / Staff' },
  { module: 'announcements', path: '/announcements', label: 'Announcements' },
  { module: 'settings', path: '/settings', label: 'Settings' },
];

export function getFirstAssignedModule(modules: readonly ModuleKey[] | null | undefined) {
  if (!modules?.length) return null;
  const assigned = new Set(modules);
  return STAFF_LANDING_ROUTES.find((route) => assigned.has(route.module)) ?? null;
}

export function getFirstAssignedModulePath(modules: readonly ModuleKey[] | null | undefined) {
  return getFirstAssignedModule(modules)?.path ?? null;
}
