import { supabase } from '@/integrations/supabase/client';

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  code?: string;
  hint?: string;
};

type EnsureWorkspaceInput = {
  existingBusinessId?: string | null;
  user: {
    id: string;
    email?: string | null;
  };
  displayName?: string;
  businessName?: string;
  phone?: string;
  location?: string;
  allowCreate?: boolean;
};

type CachedProductRow = {
  id: string;
  business_id?: string;
  name: string;
  sku?: string;
  category?: string;
  quantity?: number;
  cost_price?: number | string;
  selling_price?: number | string;
  reorder_level?: number | null;
  low_stock_threshold?: number | null;
  image_url?: string | null;
  is_archived?: boolean | null;
};

// Use only columns that actually exist in the single-tenant products schema.
// `quantity`/`cost_price`/`selling_price`/`reorder_level`/`business_id` are
// remapped from `stock`/`cost`/`price`/`low_stock_threshold`/none in
// normalizeProductRow().
const STABLE_PRODUCT_SELECT =
  'id,name,sku,category,stock,cost,price,low_stock_threshold,created_at,updated_at';

function getProductCacheKey(businessId: string) {
  return `sikaflow_products_${businessId}`;
}

async function resolveActiveBusinessIdFromSession() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;
  try {
    return await resolveCurrentBusinessId(userId);
  } catch (error) {
    logSupabaseError('workspace.resolveActiveBusinessIdFromSession', error, {
      userId,
    });
    return null;
  }
}

function readCachedProducts(businessId?: string | null): CachedProductRow[] {
  if (!businessId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getProductCacheKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedProductRow[]) : [];
  } catch {
    return [];
  }
}

function readAllCachedProducts(): CachedProductRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const rowsById = new Map<string, CachedProductRow>();
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith('sikaflow_products_')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const row of parsed as CachedProductRow[]) {
        if (!row?.id) continue;
        rowsById.set(row.id, row);
      }
    }
    return Array.from(rowsById.values());
  } catch {
    return [];
  }
}

function writeCachedProducts(businessId: string, rows: CachedProductRow[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getProductCacheKey(businessId), JSON.stringify(rows));
  } catch {
    // Ignore storage write errors. Cache is only a UX fallback.
  }
}

function normalizeProductRow(row: Record<string, unknown>): CachedProductRow {
  return {
    id: String(row.id ?? ''),
    business_id: typeof row.business_id === 'string' ? row.business_id : undefined,
    name: String(row.name ?? ''),
    sku: typeof row.sku === 'string' ? row.sku : '',
    category: typeof row.category === 'string' ? row.category : '',
    quantity:
      typeof row.quantity === 'number'
        ? row.quantity
        : row.quantity !== undefined && row.quantity !== null
          ? Number(row.quantity)
          : Number(row.stock ?? 0),
    cost_price:
      row.cost_price !== undefined && row.cost_price !== null
        ? row.cost_price as number | string
        : (row.cost as number | string | undefined) ?? 0,
    selling_price:
      row.selling_price !== undefined && row.selling_price !== null
        ? row.selling_price as number | string
        : (row.price as number | string | undefined) ?? 0,
    reorder_level:
      typeof row.reorder_level === 'number' || typeof row.reorder_level === 'string'
        ? Number(row.reorder_level ?? 0)
        : 0,
    low_stock_threshold:
      typeof row.low_stock_threshold === 'number' || typeof row.low_stock_threshold === 'string'
        ? Number(row.low_stock_threshold ?? 0)
        : typeof row.reorder_level === 'number' || typeof row.reorder_level === 'string'
          ? Number(row.reorder_level ?? 0)
          : 0,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    is_archived: typeof row.is_archived === 'boolean' ? row.is_archived : false,
  };
}

export function rememberCachedProduct(businessId: string, row: CachedProductRow) {
  const existing = readCachedProducts(businessId).filter((item) => item.id !== row.id);
  existing.push({
    ...row,
    business_id: row.business_id ?? businessId,
  });
  existing.sort((left, right) => (left.name || '').localeCompare(right.name || ''));
  writeCachedProducts(businessId, existing);
}

export function removeCachedProduct(businessId: string, productId: string) {
  const nextRows = readCachedProducts(businessId).filter((item) => item.id !== productId);
  writeCachedProducts(businessId, nextRows);
}

function mergeProductRows(
  liveRows: CachedProductRow[],
  cachedRows: CachedProductRow[],
  showArchived: boolean,
) {
  const merged = new Map<string, CachedProductRow>();

  for (const row of cachedRows) {
    merged.set(row.id, row);
  }

  for (const row of liveRows) {
    merged.set(row.id, {
      ...merged.get(row.id),
      ...row,
    });
  }

  return Array.from(merged.values())
    .filter((row) => (showArchived ? true : row.is_archived !== true))
    .sort((left, right) => (left.name || '').localeCompare(right.name || ''));
}

async function ensureBusinessRoleMembership({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  // Read existing roles. Try with business_id first, fall back to plain role.
  let roles: Array<{ role: string; business_id: string | null }> = [];
  let queryError: any = null;
  const richQuery = await supabase
    .from('user_roles')
    .select('role, business_id')
    .eq('user_id', userId);
  if (richQuery.error && isMissingColumnError(richQuery.error, 'business_id', 'user_roles')) {
    const plainQuery = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    queryError = plainQuery.error;
    roles = ((plainQuery.data || []) as Array<{ role: string }>).map((row) => ({
      role: row.role,
      business_id: null,
    }));
  } else {
    queryError = richQuery.error;
    roles = (richQuery.data || []) as Array<{ role: string; business_id: string | null }>;
  }
  if (queryError) throw queryError;

  if (
    roles.some(
      (row) =>
        (row.business_id === null || row.business_id === businessId) &&
        (row.role === 'admin' || row.role === 'manager' || row.role === 'business_owner'),
    )
  ) {
    return;
  }
  if (roles.some((row) => row.role === 'super_admin')) {
    return;
  }

  // Insert role; if business_id column is missing, insert without it.
  const tryInsert = async (payload: Record<string, unknown>) =>
    supabase.from('user_roles').insert(payload as never);
  let insertResult = await tryInsert({
    user_id: userId,
    role: 'admin',
    business_id: businessId,
  });
  if (
    insertResult.error &&
    isMissingColumnError(insertResult.error, 'business_id', 'user_roles')
  ) {
    insertResult = await tryInsert({ user_id: userId, role: 'admin' });
  }
  // Some single-tenant deployments use a different default role enum value.
  if (insertResult.error && insertResult.error.code === '22P02') {
    insertResult = await tryInsert({ user_id: userId, role: 'business_owner' });
  }
  if (insertResult.error && insertResult.error.code !== '23505') {
    throw insertResult.error;
  }
}

function isMissingFunctionError(error: unknown) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';

  return (
    code === 'PGRST202'
    || message.includes('could not find the function')
    || details.includes('could not find the function')
    || message.includes('schema cache')
  );
}

function isMissingColumnError(error: unknown, columnName?: string, tableName?: string) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';
  const targetColumn = columnName?.toLowerCase();
  const targetTable = tableName?.toLowerCase();

  const mentionsColumn =
    !targetColumn
    || message.includes(targetColumn)
    || message.includes(`'${targetColumn}'`)
    || message.includes(`column "${targetColumn}"`)
    || details.includes(targetColumn)
    || details.includes(`'${targetColumn}'`)
    || details.includes(`column "${targetColumn}"`);

  const mentionsTable =
    !targetTable
    || message.includes(targetTable)
    || message.includes(`public.${targetTable}`)
    || (targetColumn ? message.includes(`${targetTable}.${targetColumn}`) : false)
    || (targetColumn ? message.includes(`public.${targetTable}.${targetColumn}`) : false)
    || message.includes(`'${targetTable}'`)
    || message.includes(`relation "${targetTable}"`)
    || details.includes(targetTable)
    || details.includes(`public.${targetTable}`)
    || (targetColumn ? details.includes(`${targetTable}.${targetColumn}`) : false)
    || (targetColumn ? details.includes(`public.${targetTable}.${targetColumn}`) : false)
    || details.includes(`'${targetTable}'`)
    || details.includes(`relation "${targetTable}"`);

  return (
    mentionsColumn
    && mentionsTable
    && (
      code === 'PGRST204'
      || code === '42703'
      || message.includes('schema cache')
      || message.includes('column')
      || details.includes('schema cache')
      || details.includes('column')
    )
  );
}

function isMissingTableError(error: unknown, tableName?: string) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';
  const targetTable = tableName?.toLowerCase();

  const mentionsTable =
    !targetTable
    || message.includes(targetTable)
    || message.includes(`'${targetTable}'`)
    || message.includes(`relation "${targetTable}"`)
    || message.includes(`table ${targetTable}`)
    || details.includes(targetTable)
    || details.includes(`'${targetTable}'`)
    || details.includes(`relation "${targetTable}"`)
    || details.includes(`table ${targetTable}`);

  return (
    mentionsTable
    && (
      code === 'PGRST205'
      || code === '42P01'
      || message.includes('could not find the table')
      || details.includes('could not find the table')
      || message.includes('schema cache')
      || details.includes('schema cache')
      || message.includes('relation')
      || details.includes('relation')
    )
  );
}

function extractMissingColumnFromError(error: unknown): string | null {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const haystacks = [normalized.message, normalized.details, normalized.hint].filter(
    (value): value is string => typeof value === 'string',
  );
  const code = normalized.code?.toUpperCase() ?? '';
  if (code !== 'PGRST204' && code !== '42703' && !haystacks.some((h) => /column|schema cache/i.test(h))) {
    return null;
  }
  const patterns = [
    /column "([^"]+)"/i,
    /column ([a-zA-Z0-9_.]+) does not exist/i,
    /'([a-zA-Z0-9_]+)' column/i,
    /Could not find the '([a-zA-Z0-9_]+)' column/i,
  ];
  for (const text of haystacks) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const raw = match[1];
        const dot = raw.lastIndexOf('.');
        return dot >= 0 ? raw.slice(dot + 1) : raw;
      }
    }
  }
  return null;
}

async function updateWithOptionalColumnFallback<T extends Record<string, unknown>>({
  table,
  matchColumn,
  matchValue,
  payload,
  optionalColumns,
  context,
}: {
  table: string;
  matchColumn: string;
  matchValue: string;
  payload: T;
  optionalColumns: string[];
  context: string;
}) {
  const nextPayload: Record<string, unknown> = { ...payload };
  const remainingColumns = new Set(optionalColumns);
  const droppedColumns = new Set<string>();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { error } = await supabase
      .from(table as any)
      .update(nextPayload as never)
      .eq(matchColumn, matchValue);

    if (!error) return;

    // Try the listed optional columns first.
    let missingColumn = Array.from(remainingColumns).find((column) =>
      isMissingColumnError(error, column, table),
    );
    // Then auto-detect any column from the error message and drop it too.
    if (!missingColumn) {
      const detected = extractMissingColumnFromError(error);
      if (detected && detected in nextPayload && !droppedColumns.has(detected)) {
        missingColumn = detected;
      }
    }
    if (!missingColumn) throw error;

    logSupabaseError(context, error, {
      table,
      missingColumn,
      fallbackMode: 'updateWithoutOptionalColumn',
    });
    remainingColumns.delete(missingColumn);
    droppedColumns.add(missingColumn);
    delete nextPayload[missingColumn];
  }
}

async function insertWithOptionalColumnFallback<T extends Record<string, unknown>>({
  table,
  payload,
  optionalColumns,
  context,
}: {
  table: string;
  payload: T;
  optionalColumns: string[];
  context: string;
}) {
  const nextPayload: Record<string, unknown> = { ...payload };
  const remainingColumns = new Set(optionalColumns);
  const droppedColumns = new Set<string>();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from(table as any)
      .insert(nextPayload as never)
      .select()
      .single();

    if (!error) return data;

    let missingColumn = Array.from(remainingColumns).find((column) =>
      isMissingColumnError(error, column, table),
    );
    if (!missingColumn) {
      const detected = extractMissingColumnFromError(error);
      if (detected && detected in nextPayload && !droppedColumns.has(detected)) {
        missingColumn = detected;
      }
    }
    if (!missingColumn) throw error;

    logSupabaseError(context, error, {
      table,
      missingColumn,
      fallbackMode: 'insertWithoutOptionalColumn',
    });
    remainingColumns.delete(missingColumn);
    droppedColumns.add(missingColumn);
    delete nextPayload[missingColumn];
  }
}

export async function updateBusinessWorkspaceRecord(
  businessId: string,
  payload: Record<string, unknown>,
) {
  // The current schema does not have a separate `businesses` table — the
  // user's business info lives on `profiles`. Update that row instead so
  // setup completes against single-tenant schemas without breaking
  // multi-tenant ones (the helper auto-drops unknown columns).
  return updateWithOptionalColumnFallback({
    table: 'profiles',
    matchColumn: 'id',
    matchValue: businessId,
    payload: {
      business_name: payload.name ?? payload.business_name,
      business_type: payload.business_type,
      phone: payload.phone,
      location: payload.location,
      logo_url: payload.logo_light_url ?? payload.logo_url,
    },
    optionalColumns: ['business_type', 'logo_url', 'logo_light_url', 'logo_dark_url', 'status', 'email_verified'],
    context: 'workspace.updateBusiness',
  });
}

export async function updateProfileRecord(
  userId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'profiles',
    // The schema uses `id` (= auth user id) as the primary key.
    matchColumn: 'id',
    matchValue: userId,
    payload,
    optionalColumns: [
      'onboarding_completed',
      'business_id',
      'display_name',
      'email_verified',
      'avatar_url',
      'title',
      'bio',
    ],
    context: 'workspace.updateProfile',
  });
}


export async function insertSaleRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'sales',
    payload,
    optionalColumns: ['due_date', 'status', 'sale_channel', 'stock_status', 'stock_shortfall'],
    context: 'workspace.insertSale',
  });
}

export async function updateSaleRecord(
  saleId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'sales',
    matchColumn: 'id',
    matchValue: saleId,
    payload,
    optionalColumns: ['due_date', 'status', 'sale_channel', 'stock_status', 'stock_shortfall'],
    context: 'workspace.updateSale',
  });
}

export async function insertSaleItemRecord(
  payload: Record<string, unknown>,
) {
  // Remap multi-tenant column names to the single-tenant schema's names so
  // the insert succeeds whether the column is `unit_cost` or `cost_price`.
  const remapped: Record<string, unknown> = { ...payload };
  if (remapped.cost_price !== undefined && remapped.unit_cost === undefined) {
    remapped.unit_cost = remapped.cost_price;
  }
  if (remapped.line_total !== undefined && remapped.total === undefined) {
    remapped.total = remapped.line_total;
  }
  return insertWithOptionalColumnFallback({
    table: 'sale_items',
    payload: remapped,
    // Columns that exist in some schema variants but not others — drop on
    // missing-column errors so the insert doesn't fail on schema mismatch.
    optionalColumns: [
      'business_id',
      'sku',
      'size',
      'color',
      'cost_price',
      'line_total',
      'total',
      'default_price',
      'price_note',
    ],
    context: 'workspace.insertSaleItem',
  });
}

export async function createProductRecord(
  payload: Record<string, unknown>,
) {
  const businessId = typeof payload.business_id === 'string' ? payload.business_id : null;
  const userId = typeof payload.user_id === 'string' ? payload.user_id : null;

  if (businessId && userId) {
    try {
      await ensureBusinessRoleMembership({ businessId, userId });
    } catch (roleError) {
      logSupabaseError('workspace.createProduct.ensureRoleMembership', roleError, {
        businessId,
        userId,
      });
    }
  }

  // Remap multi-tenant schema names to the single-tenant schema's column
  // names. We send BOTH so whichever exists succeeds; missing ones are
  // dropped via the auto-detect fallback below.
  const remapped: Record<string, unknown> = { ...payload };
  if (remapped.cost_price !== undefined && remapped.cost === undefined) {
    remapped.cost = remapped.cost_price;
  }
  if (remapped.selling_price !== undefined && remapped.price === undefined) {
    remapped.price = remapped.selling_price;
  }
  if (remapped.quantity !== undefined && remapped.stock === undefined) {
    remapped.stock = remapped.quantity;
  }
  if (remapped.reorder_level !== undefined && remapped.low_stock_threshold === undefined) {
    remapped.low_stock_threshold = remapped.reorder_level;
  }

  const nextPayload: Record<string, unknown> = { ...remapped };
  const remainingColumns = new Set([
    'user_id',
    'business_id',
    'low_stock_threshold',
    'is_archived',
    'reorder_level',
    'category',
    'cost_price',
    'selling_price',
    'quantity',
    'image_url',
  ]);
  const droppedColumns = new Set<string>();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from('products')
      .insert(nextPayload as never)
      .select('id')
      .single();

    if (!error) return data as { id: string };

    let missingColumn = Array.from(remainingColumns).find((column) =>
      isMissingColumnError(error, column, 'products'),
    );
    if (!missingColumn) {
      const detected = extractMissingColumnFromError(error);
      if (detected && detected in nextPayload && !droppedColumns.has(detected)) {
        missingColumn = detected;
      }
    }
    if (!missingColumn) throw error;

    logSupabaseError('workspace.createProduct', error, {
      table: 'products',
      missingColumn,
      fallbackMode: 'insertWithoutOptionalColumn',
    });
    remainingColumns.delete(missingColumn);
    droppedColumns.add(missingColumn);
    delete nextPayload[missingColumn];
  }
  throw new Error('Could not create product after dropping unknown columns.');
}

export async function updateProductRecord(
  productId: string,
  payload: Record<string, unknown>,
) {
  // Remap multi-tenant -> single-tenant column names so updates work either way.
  const remapped: Record<string, unknown> = { ...payload };
  if (remapped.cost_price !== undefined && remapped.cost === undefined) remapped.cost = remapped.cost_price;
  if (remapped.selling_price !== undefined && remapped.price === undefined) remapped.price = remapped.selling_price;
  if (remapped.quantity !== undefined && remapped.stock === undefined) remapped.stock = remapped.quantity;
  if (remapped.reorder_level !== undefined && remapped.low_stock_threshold === undefined) {
    remapped.low_stock_threshold = remapped.reorder_level;
  }
  return updateWithOptionalColumnFallback({
    table: 'products',
    matchColumn: 'id',
    matchValue: productId,
    payload: remapped,
    optionalColumns: ['user_id', 'low_stock_threshold', 'is_archived', 'reorder_level', 'cost_price', 'selling_price', 'quantity', 'business_id', 'image_url'],
    context: 'workspace.updateProduct',
  });
}

export async function insertRestockRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'restocks',
    payload,
    optionalColumns: ['status', 'business_id', 'is_opening_stock'],
    context: 'workspace.insertRestock',
  });
}

export async function updateRestockRecord(
  restockId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'restocks',
    matchColumn: 'id',
    matchValue: restockId,
    payload,
    optionalColumns: ['status', 'business_id', 'is_opening_stock'],
    context: 'workspace.updateRestock',
  });
}

export async function insertExpenseRecord(
  payload: Record<string, unknown>,
) {
  return insertWithOptionalColumnFallback({
    table: 'expenses',
    payload,
    optionalColumns: ['business_id', 'payment_method', 'attachment_path', 'attachment_name'],
    context: 'workspace.insertExpense',
  });
}

export async function updateExpenseRecord(
  expenseId: string,
  payload: Record<string, unknown>,
) {
  return updateWithOptionalColumnFallback({
    table: 'expenses',
    matchColumn: 'id',
    matchValue: expenseId,
    payload,
    optionalColumns: ['business_id', 'payment_method', 'attachment_path', 'attachment_name'],
    context: 'workspace.updateExpense',
  });
}

export async function loadProductsCompat(showArchived: boolean, businessId?: string | null) {
  const effectiveBusinessId = businessId ?? await resolveActiveBusinessIdFromSession();
  const allCachedRows = readAllCachedProducts();
  // The live single-tenant schema has no `is_archived` or `category` columns.
  // Always use the stable select to avoid schema-cache errors that wipe the
  // product list (which then zeroes out Stock Left / Stock Value / Profit).
  const scopedBaseQuery = () => {
    return supabase.from('products').select(STABLE_PRODUCT_SELECT).order('name');
  };
  const visibleBaseQuery = () => supabase.from('products').select(STABLE_PRODUCT_SELECT).order('name');
  const stableBaseQuery = () => {
    return supabase.from('products').select(STABLE_PRODUCT_SELECT).order('name');
  };
  const filterVisibleRows = (rows: CachedProductRow[]) =>
    effectiveBusinessId
      ? rows.filter((row) => row.business_id === effectiveBusinessId)
      : rows;
  const filterCachedRows = (rows: CachedProductRow[]) =>
    showArchived ? rows : rows.filter((row) => row.is_archived !== true);
  const getCachedRowsFallback = () => {
    const businessScopedRows = filterCachedRows(readCachedProducts(effectiveBusinessId));
    if (businessScopedRows.length > 0) return businessScopedRows;
    return filterCachedRows(filterVisibleRows(allCachedRows));
  };
  const loadStableRows = async () => {
    const { data: stableData, error: stableError } = await stableBaseQuery();
    if (stableError) throw stableError;
    return ((stableData ?? []) as Array<Record<string, unknown>>).map(normalizeProductRow);
  };

  if (showArchived) {
    try {
      const { data, error } = await scopedBaseQuery();
      if (error) throw error;
      let liveRows = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeProductRow);
      if (liveRows.length === 0 && effectiveBusinessId) {
        const stableRows = await loadStableRows();
        liveRows = stableRows;
      }
      const mergedRows = mergeProductRows(liveRows, filterVisibleRows(allCachedRows), true);
      if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
      return mergedRows;
    } catch (error) {
      logSupabaseError('workspace.loadProductsCompat.showArchived', error, {
        businessId: effectiveBusinessId,
      });
      try {
        const stableRows = await loadStableRows();
        const mergedRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), true);
        if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
        return mergedRows;
      } catch (stableError) {
        logSupabaseError('workspace.loadProductsCompat.showArchived.fallback', stableError, {
          businessId: effectiveBusinessId,
        });
        return getCachedRowsFallback();
      }
    }
  }

  const { data, error } = await scopedBaseQuery();
  if (!error) {
    const rawRows = (data ?? []) as Array<Record<string, unknown>>;
    if (rawRows.length > 0) {
      const mergedRows = mergeProductRows(
        rawRows.map(normalizeProductRow),
        filterVisibleRows(allCachedRows),
        false,
      );
      if (effectiveBusinessId && mergedRows.length > 0) writeCachedProducts(effectiveBusinessId, mergedRows);
      return mergedRows;
    }

    const { data: fallbackData, error: fallbackError } = await scopedBaseQuery();
    if (fallbackError) throw fallbackError;
    const filteredRows = ((fallbackData ?? []) as Array<Record<string, unknown>>)
      .map(normalizeProductRow)
      .filter((row) => row.is_archived !== true);
    const mergedRows = mergeProductRows(filteredRows, filterVisibleRows(allCachedRows), false);
    if (mergedRows.length > 0) {
      if (businessId) writeCachedProducts(businessId, mergedRows);
      return mergedRows;
    }

    if (effectiveBusinessId) {
      try {
        const stableRows = await loadStableRows();
        const mergedStableRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), false);
        if (mergedStableRows.length > 0) {
          writeCachedProducts(effectiveBusinessId, mergedStableRows);
          return mergedStableRows;
        }
      } catch (stableError) {
        logSupabaseError('workspace.loadProductsCompat.stableAfterEmpty', stableError, {
          businessId: effectiveBusinessId,
        });
      }
    }

    if (effectiveBusinessId) {
      const { data: visibleRows, error: visibleError } = await visibleBaseQuery();
      if (!visibleError) {
        const mergedVisibleRows = mergeProductRows(
          filterVisibleRows((visibleRows ?? []) as CachedProductRow[]).filter((row) => row.is_archived !== true),
          filterVisibleRows(allCachedRows),
          false,
        );
        if (mergedVisibleRows.length > 0) {
          writeCachedProducts(effectiveBusinessId, mergedVisibleRows);
          return mergedVisibleRows;
        }
      }
    }

    return getCachedRowsFallback();
  }
  if (!isMissingColumnError(error, 'is_archived', 'products')) {
    logSupabaseError('workspace.loadProductsCompat', error, {
      table: 'products',
      fallbackMode: 'loadFromCacheAfterReadFailure',
      businessId: effectiveBusinessId,
      showArchived,
    });
    return getCachedRowsFallback();
  }

  logSupabaseError('workspace.loadProductsCompat', error, {
    table: 'products',
    missingColumn: 'is_archived',
    fallbackMode: 'loadWithoutArchiveColumn',
  });
  try {
    const stableRows = await loadStableRows();
    const mergedRows = mergeProductRows(stableRows, filterVisibleRows(allCachedRows), false);
    if (mergedRows.length > 0 && effectiveBusinessId) writeCachedProducts(effectiveBusinessId, mergedRows);
    return mergedRows.length > 0 ? mergedRows : getCachedRowsFallback();
  } catch (stableError) {
    logSupabaseError('workspace.loadProductsCompat.fallback', stableError, {
      table: 'products',
      fallbackMode: 'loadFromCacheAfterStableFallbackFailure',
      businessId: effectiveBusinessId,
      showArchived,
    });
    return getCachedRowsFallback();
  }
}

function normalizeStockMovementRow(row: Record<string, unknown>) {
  const changeValue = row.quantity_change ?? row.change ?? 0;
  return {
    ...row,
    movement_type: String(row.movement_type ?? row.reason ?? 'adjustment'),
    quantity_change: Number(changeValue ?? 0),
    quantity_after: row.quantity_after ?? null,
    created_by_name: row.created_by_name ?? row.added_by_name ?? null,
    movement_date: String(row.movement_date ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function loadStockMovementsCompat(limit = 100, businessId?: string | null) {
  const effectiveBusinessId = businessId ?? await resolveActiveBusinessIdFromSession();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? effectiveBusinessId ?? null;
  let query = supabase
    .from('stock_movements' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (!error) return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeStockMovementRow) as any[];
  if (!isMissingTableError(error, 'stock_movements')) throw error;

  logSupabaseError('workspace.loadStockMovementsCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'loadWithoutStockMovementsTable',
  });
  return [];
}

export async function insertStockMovementCompat(
  payload: Record<string, unknown>,
) {
  const remapped: Record<string, unknown> = { ...payload };
  if (remapped.user_id === undefined && typeof remapped.created_by === 'string') {
    remapped.user_id = remapped.created_by;
  }
  if (remapped.change === undefined && remapped.quantity_change !== undefined) {
    remapped.change = remapped.quantity_change;
  }
  if (remapped.reason === undefined && remapped.movement_type !== undefined) {
    remapped.reason = remapped.movement_type === 'sale' ? 'sold' : remapped.movement_type;
  }
  if (remapped.reference_id === undefined && remapped.source_id !== undefined) {
    remapped.reference_id = remapped.source_id;
  }
  if (remapped.added_by_name === undefined && remapped.created_by_name !== undefined) {
    remapped.added_by_name = remapped.created_by_name;
  }

  const businessId = typeof remapped.business_id === 'string' ? remapped.business_id : null;
  const userId =
    typeof remapped.created_by === 'string'
      ? remapped.created_by
      : typeof remapped.user_id === 'string'
        ? remapped.user_id
        : null;

  if (businessId && userId) {
    try {
      await ensureBusinessRoleMembership({ businessId, userId });
    } catch (roleError) {
      logSupabaseError('workspace.insertStockMovementCompat.ensureRoleMembership', roleError, {
        businessId,
        userId,
      });
    }
  }

  const { error } = await supabase.from('stock_movements' as any).insert(remapped);

  if (!error) {
    return { inserted: true, skipped: false } as const;
  }

  const missingColumnInsert = await insertWithOptionalColumnFallback({
    table: 'stock_movements',
    payload: remapped,
    optionalColumns: [
      'business_id',
      'movement_type',
      'quantity_change',
      'quantity_after',
      'unit_cost',
      'unit_price',
      'created_by',
      'created_by_name',
      'movement_date',
      'source_table',
      'source_id',
    ],
    context: 'workspace.insertStockMovementCompat',
  }).catch((fallbackError) => {
    if (!isMissingTableError(fallbackError, 'stock_movements')) throw fallbackError;
    return null;
  });

  if (missingColumnInsert) {
    return { inserted: true, skipped: false } as const;
  }

  if (!isMissingTableError(error, 'stock_movements')) throw error;

  logSupabaseError('workspace.insertStockMovementCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'skipMissingStockMovementsTable',
    payload,
  });
  return { inserted: false, skipped: true } as const;
}

export async function deleteStockMovementsBySourceCompat(sourceIds: string[]) {
  if (sourceIds.length === 0) return { deleted: false, skipped: false } as const;

  // The single-tenant schema uses `reference_id` + `reason` (not
  // source_id/source_type). Match either column shape so we work against
  // both schema variants.
  const tryDelete = async (idColumn: 'reference_id' | 'source_id', reasonColumn: 'reason' | 'source_table', reasonValue: string) => {
    return supabase
      .from('stock_movements' as any)
      .delete()
      .in(idColumn, sourceIds)
      .eq(reasonColumn, reasonValue);
  };

  // Try the actual schema first.
  let { error } = await tryDelete('reference_id', 'reason', 'sold');
  if (error && (isMissingColumnError(error, 'reference_id', 'stock_movements') || isMissingColumnError(error, 'reason', 'stock_movements'))) {
    ({ error } = await tryDelete('source_id', 'source_table', 'sale_items'));
  }

  if (!error) {
    return { deleted: true, skipped: false } as const;
  }

  if (!isMissingTableError(error, 'stock_movements')) {
    // Don't crash sale deletion if the legacy column shape also doesn't match —
    // log and skip so the sale itself can still be removed.
    logSupabaseError('workspace.deleteStockMovementsBySourceCompat', error, {
      table: 'stock_movements',
      fallbackMode: 'skipOnSchemaMismatch',
      sourceIds,
    });
    return { deleted: false, skipped: true } as const;
  }

  logSupabaseError('workspace.deleteStockMovementsBySourceCompat', error, {
    table: 'stock_movements',
    fallbackMode: 'skipMissingStockMovementsTable',
    sourceIds,
  });
  return { deleted: false, skipped: true } as const;
}

export function getErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message as string;
  }
  return fallback;
}

export function logSupabaseError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  console.error(`[SikaFlow:${context}]`, {
    message: normalized.message ?? (error instanceof Error ? error.message : 'Unknown error'),
    details: normalized.details ?? null,
    code: normalized.code ?? null,
    hint: normalized.hint ?? null,
    ...extra,
    rawError: error,
  });
}

export async function resolveCurrentBusinessId(userId: string) {
  // Try the multi-tenant column first; fall back to single-tenant where
  // each user IS their own workspace (businessId = userId).
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', userId)
      .maybeSingle();
    if (!error) {
      return ((data as any)?.business_id as string | null) ?? userId;
    }
    if (!isMissingColumnError(error, 'business_id', 'profiles')) throw error;
  } catch (error) {
    if (!isMissingColumnError(error, 'business_id', 'profiles')) throw error;
  }
  return userId;
}

async function fallbackProfileMembership({
  businessId,
  userId,
  displayName,
  email,
  phone,
}: {
  businessId: string;
  userId: string;
  displayName?: string;
  email?: string | null;
  phone?: string;
}) {
  // Use the schema-tolerant updater so unknown columns (business_id,
  // email_verified, …) are silently dropped on single-tenant schemas.
  await updateProfileRecord(userId, {
    business_id: businessId,
    display_name: displayName?.trim() || email?.split('@')[0]?.trim() || 'User',
    phone: phone?.trim() || null,
  });
  try {
    await ensureBusinessRoleMembership({ businessId, userId });
  } catch (roleError) {
    logSupabaseError('workspace.fallbackProfileMembership.ensureRole', roleError, {
      businessId,
      userId,
    });
  }
  return businessId;
}

export async function ensureUserBusinessWorkspace({
  existingBusinessId,
  user,
  displayName,
  businessName,
  phone,
  location,
  allowCreate = true,
}: EnsureWorkspaceInput) {
  const ensureMembership = async (businessId: string) => {
    const { data, error } = await supabase.rpc('ensure_business_workspace_membership', {
      _business_id: businessId,
      _display_name: displayName?.trim() || user.email?.split('@')[0]?.trim() || 'User',
      _phone: phone?.trim() || '',
    });

    if (error) {
      if (isMissingFunctionError(error)) {
        logSupabaseError('workspace.ensureMembershipFallback', error, {
          businessId,
          userId: user.id,
        });
        return fallbackProfileMembership({
          businessId,
          userId: user.id,
          displayName,
          email: user.email,
          phone,
        });
      }
      throw error;
    }
    await ensureBusinessRoleMembership({ businessId, userId: user.id });
    return (data as string | null) || businessId;
  };

  if (existingBusinessId) {
    return ensureMembership(existingBusinessId);
  }

  const profileBusinessId = await resolveCurrentBusinessId(user.id);
  if (profileBusinessId) {
    return ensureMembership(profileBusinessId);
  }

  if (!allowCreate) {
    return null;
  }

  const fallbackBusinessName =
    businessName?.trim() ||
    displayName?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'My Business';

  const { data, error } = await supabase.rpc('create_business_for_owner', {
    _name: fallbackBusinessName,
    _email: user.email?.trim() || '',
    _phone: phone?.trim() || '',
    _location: location?.trim() || '',
    _employees: 1,
    _logo_light_url: '',
    _logo_dark_url: '',
  });

  if (error) {
    if (isMissingFunctionError(error)) {
      // Single-tenant fallback: the user IS their own workspace.
      logSupabaseError('workspace.createBusinessFallback', error, { userId: user.id });
      return ensureMembership(user.id);
    }
    throw error;
  }
  if (!data) {
    return ensureMembership(user.id);
  }
  return ensureMembership(data as string);
}
