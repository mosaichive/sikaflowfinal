import { supabase } from '@/integrations/supabase/client';

export const BACKUP_FORMAT = 'kuditrack-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.kuditrack';
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024; // 25MB

export interface BackupFile {
  format: string;
  version: number;
  created_at: string;
  app: string;
  business: Record<string, any>;
  currency: string;
  branches: any[];
  products: any[];
  inventory: any[];
  sales: any[];
  sale_items: any[];
  orders: any[];
  order_items: any[];
  customers: any[];
  expenses: any[];
  other_income: any[];
  savings: any[];
  investments: any[];
  bank_accounts: any[];
  staff: any[];
  settings: Record<string, any>;
}

export interface BackupSummary {
  businessName: string;
  currency: string;
  createdAt: string | null;
  version: number;
  counts: Record<string, number>;
}

/** Profile fields that are safe to export. Anything security, billing or auth related is excluded. */
const SAFE_PROFILE_FIELDS = [
  'business_name', 'business_type', 'phone', 'location', 'num_employees', 'logo_url',
  'display_name', 'title', 'bio', 'currency', 'opening_cash_balance',
  'allow_sales_without_stock', 'store_show_stock', 'store_enable_notes',
  'store_enable_delivery_address', 'store_enable_product_images',
  'store_default_delivery_fee', 'store_allow_pickup', 'store_allow_delivery',
  'store_payment_instructions', 'store_payment_methods', 'online_ordering_enabled',
  'orders_auto_publish_products', 'sms_notify_sale_thanks', 'sms_notify_low_stock',
  'sms_notify_team_invite', 'sms_notify_new_order', 'sms_notify_order_status',
] as const;

function pick(source: any, fields: readonly string[]) {
  const out: Record<string, any> = {};
  if (!source) return out;
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

async function fetchAll(table: string, column: string, value: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, value)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Builds the full backup payload for a business owner (RLS scoped to the caller). */
export async function buildBackup(ownerId: string): Promise<BackupFile> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('*').eq('id', ownerId).maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const [
    products, customers, restocks, expenses, otherIncome, savings, investments,
    bankAccounts, sales, saleItems, orders, orderItems, staff,
  ] = await Promise.all([
    fetchAll('products', 'user_id', ownerId),
    fetchAll('customers', 'user_id', ownerId),
    fetchAll('restocks', 'user_id', ownerId),
    fetchAll('expenses', 'user_id', ownerId),
    fetchAll('other_income', 'user_id', ownerId),
    fetchAll('savings', 'user_id', ownerId),
    fetchAll('investments', 'user_id', ownerId),
    fetchAll('bank_accounts', 'user_id', ownerId),
    fetchAll('sales', 'user_id', ownerId),
    fetchAll('sale_items', 'user_id', ownerId),
    fetchAll('orders', 'business_id', ownerId),
    fetchAll('order_items', 'business_id', ownerId),
    fetchAll('staff_members', 'business_owner_id', ownerId),
  ]);

  const businessProfile = pick(profile, SAFE_PROFILE_FIELDS);
  const currency = (profile as any)?.currency || 'GHS';

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    app: 'KudiTrack',
    business: businessProfile,
    currency,
    // KudiTrack currently operates a single main branch per business. The branch
    // block is preserved in the format so multi-branch backups stay compatible.
    branches: [{
      id: ownerId,
      name: 'Main Branch',
      is_main: true,
      location: (profile as any)?.location ?? null,
      currency,
    }],
    products,
    inventory: restocks,
    sales,
    sale_items: saleItems,
    orders,
    order_items: orderItems,
    customers,
    expenses,
    other_income: otherIncome,
    savings,
    investments,
    bank_accounts: bankAccounts,
    // Staff assignments only — never credentials.
    staff: staff.map((row: any) => ({
      display_name: row.display_name,
      email: row.email,
      permissions: row.permissions,
      active: row.active,
      branch_id: ownerId,
    })),
    settings: businessProfile,
  };
}

export function backupFileName(businessName: string) {
  const slug = (businessName || 'kuditrack').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'kuditrack'}-backup-${new Date().toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
}

export function downloadBackup(backup: BackupFile, businessName: string) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(businessName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ARRAY_SECTIONS = [
  'products', 'inventory', 'sales', 'sale_items', 'orders', 'order_items',
  'customers', 'expenses', 'other_income', 'savings', 'investments', 'bank_accounts', 'branches',
] as const;

export type ValidationResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

const INVALID_MESSAGE = 'This backup file could not be restored because it is invalid or corrupted.';

/** Validates a parsed backup object before it is ever sent to the server. */
export function validateBackup(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: INVALID_MESSAGE };
  const data = raw as Record<string, any>;

  if (data.format !== BACKUP_FORMAT) return { ok: false, error: INVALID_MESSAGE };
  const version = Number(data.version);
  if (!Number.isInteger(version) || version < 1) return { ok: false, error: INVALID_MESSAGE };
  if (version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was created with a newer version of KudiTrack and cannot currently be restored.' };
  }
  if (!data.business || typeof data.business !== 'object' || Array.isArray(data.business)) {
    return { ok: false, error: INVALID_MESSAGE };
  }
  if (typeof data.currency !== 'string' || data.currency.length < 2 || data.currency.length > 8) {
    return { ok: false, error: INVALID_MESSAGE };
  }
  if (data.created_at && Number.isNaN(Date.parse(String(data.created_at)))) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  for (const section of ARRAY_SECTIONS) {
    const value = data[section];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) return { ok: false, error: INVALID_MESSAGE };
    if (value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      return { ok: false, error: INVALID_MESSAGE };
    }
  }

  const products: any[] = data.products || [];
  if (products.some((p) => typeof p.name !== 'string' || !p.name.trim())) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  // Relationship integrity: sale items must point at a sale contained in the backup.
  const saleIds = new Set((data.sales || []).map((s: any) => s.id));
  const orphanItems = (data.sale_items || []).filter((i: any) => i.sale_id && !saleIds.has(i.sale_id));
  if (saleIds.size > 0 && orphanItems.length === (data.sale_items || []).length && orphanItems.length > 0) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  const isEmpty = ARRAY_SECTIONS.every((section) => !(data[section] || []).length)
    && !data.business.business_name;
  if (isEmpty) return { ok: false, error: 'This backup file is empty — there is nothing to restore.' };

  const backup = data as BackupFile;
  return {
    ok: true,
    backup,
    summary: {
      businessName: backup.business.business_name || 'Unnamed business',
      currency: backup.currency,
      createdAt: backup.created_at || null,
      version,
      counts: {
        branches: (backup.branches || []).length || 1,
        products: (backup.products || []).length,
        inventory: (backup.inventory || []).length,
        customers: (backup.customers || []).length,
        sales: (backup.sales || []).length,
        orders: (backup.orders || []).length,
        expenses: (backup.expenses || []).length,
        other_income: (backup.other_income || []).length,
        savings: (backup.savings || []).length,
        investments: (backup.investments || []).length,
        staff: (backup.staff || []).length,
      },
    },
  };
}

export async function readBackupFile(file: File): Promise<ValidationResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'This backup file is too large to restore (limit 25MB).' };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(BACKUP_EXTENSION) && !name.endsWith('.json')) {
    return { ok: false, error: 'Unsupported file type. Upload a .kuditrack backup file.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: INVALID_MESSAGE };
  }
  return validateBackup(parsed);
}

export type RestoreMode = 'fresh' | 'new_business' | 'merge';

export async function restoreBackup(backup: BackupFile, mode: RestoreMode) {
  const { data, error } = await supabase.rpc('restore_business_backup', {
    _payload: backup as any,
    _mode: mode,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; restore_id: string; restored: Record<string, number>; skipped: Record<string, number> };
}

/** Detects whether the signed-in owner already has business data. */
export async function hasExistingBusinessData(ownerId: string) {
  const checks = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('user_id', ownerId),
    supabase.from('sales').select('id', { count: 'exact', head: true }).eq('user_id', ownerId),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', ownerId),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('user_id', ownerId),
  ]);
  return checks.some((res: any) => (res.count || 0) > 0);
}
