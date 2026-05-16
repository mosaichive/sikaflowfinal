// Module-level permissions for team members.
// Owners + admins always have all modules; other roles have a default set
// that can be customised per-member by the owner.

export type ModuleKey =
  | 'dashboard'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'orders'
  | 'other_income'
  | 'expenses'
  | 'savings'
  | 'reports'
  | 'staff'
  | 'announcements'
  | 'settings';

export const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales', label: 'Sales / POS' },
  { key: 'products', label: 'Products' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'customers', label: 'Customers' },
  { key: 'orders', label: 'Orders' },
  { key: 'other_income', label: 'Other Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'savings', label: 'Savings' },
  { key: 'reports', label: 'Reports' },
  { key: 'staff', label: 'Team / Staff' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'settings', label: 'Settings' },
];

export const ROLE_PRESETS: Record<string, ModuleKey[]> = {
  admin: ALL_MODULES.map((m) => m.key),
  manager: ['dashboard', 'sales', 'products', 'inventory', 'customers', 'orders', 'other_income', 'expenses', 'savings', 'reports', 'announcements'],
  salesperson: ['dashboard', 'sales', 'customers', 'orders', 'announcements'],
  cashier: ['dashboard', 'sales', 'customers', 'announcements'],
  distributor: ['dashboard', 'inventory', 'orders', 'announcements'],
  staff: ['dashboard', 'announcements'],
};

export const TEAM_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'staff', label: 'Staff' },
];

export function modulesForRole(role: string): ModuleKey[] {
  return ROLE_PRESETS[role] || ROLE_PRESETS.staff;
}

export function buildInvitePermissions(role: string, modules: ModuleKey[]) {
  return { role, modules };
}
