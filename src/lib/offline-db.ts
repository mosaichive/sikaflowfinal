import { openDB, type IDBPDatabase } from 'idb';

/**
 * Offline-first persistence layer.
 *
 * Everything the app needs to keep trading without a connection lives in
 * IndexedDB so it survives reloads, tab crashes and device sleep. localStorage
 * is deliberately not used for the queue: it is synchronous, size-limited and
 * gets cleared by some mobile browsers under memory pressure.
 */

const DB_NAME = 'kuditrack-offline';
const DB_VERSION = 3;

export const STORE_META = 'meta';
export const STORE_PRODUCTS = 'products';
export const STORE_CUSTOMERS = 'customers';
export const STORE_EXPENSES = 'expenses';
export const STORE_INCOME = 'income';
export const STORE_QUEUE = 'queue';
export const STORE_LOCAL_SALES = 'local_sales';
type CacheStore =
  | typeof STORE_PRODUCTS
  | typeof STORE_CUSTOMERS
  | typeof STORE_EXPENSES
  | typeof STORE_INCOME;

export type QueueKind = 'sale' | 'customer' | 'expense' | 'income';

export type QueueStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export type QueueItem = {
  /** Client transaction id — the idempotency key sent to the server. */
  id: string;
  kind: QueueKind;
  ownerId: string;
  /** Auth user that created the item. Keeps shared-device queues private. */
  actorId?: string;
  businessId: string | null;
  deviceId: string;
  payload: Record<string, unknown>;
  /** Human label shown in the sync panel. */
  label: string;
  amount: number;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  /** Epoch ms; the engine will not retry before this time. */
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
};

export type LocalSaleRecord = {
  id: string;
  ownerId: string;
  actorId?: string;
  businessId: string | null;
  serverId: string | null;
  createdAt: number;
  /** Full snapshot so an offline receipt can be printed immediately. */
  snapshot: Record<string, unknown>;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

async function getDb() {
  if (!hasIndexedDb()) throw new Error('IndexedDB is not available in this browser');
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
          db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
          db.createObjectStore(STORE_EXPENSES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_INCOME)) {
          db.createObjectStore(STORE_INCOME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queue = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
          queue.createIndex('status', 'status');
          queue.createIndex('createdAt', 'createdAt');
          queue.createIndex('businessId', 'businessId');
          queue.createIndex('actorId', 'actorId');
        } else {
          const queue = transaction.objectStore(STORE_QUEUE);
          if (!queue.indexNames.contains('businessId')) queue.createIndex('businessId', 'businessId');
          if (!queue.indexNames.contains('actorId')) queue.createIndex('actorId', 'actorId');
        }
        if (!db.objectStoreNames.contains(STORE_LOCAL_SALES)) {
          const sales = db.createObjectStore(STORE_LOCAL_SALES, { keyPath: 'id' });
          sales.createIndex('createdAt', 'createdAt');
          sales.createIndex('businessId', 'businessId');
          sales.createIndex('actorId', 'actorId');
        } else {
          const sales = transaction.objectStore(STORE_LOCAL_SALES);
          if (!sales.indexNames.contains('businessId')) sales.createIndex('businessId', 'businessId');
          if (!sales.indexNames.contains('actorId')) sales.createIndex('actorId', 'actorId');
        }
      },
    });
  }
  return dbPromise;
}

export function offlineStorageAvailable() {
  return hasIndexedDb();
}

/* ------------------------------------------------------------------ meta */

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    return ((await db.get(STORE_META, key)) as T) ?? null;
  } catch {
    return null;
  }
}

export async function setMeta(key: string, value: unknown) {
  try {
    const db = await getDb();
    await db.put(STORE_META, value, key);
  } catch {
    /* storage unavailable — degrade to online-only */
  }
}

export async function deleteMeta(key: string) {
  try {
    const db = await getDb();
    await db.delete(STORE_META, key);
  } catch {
    /* storage unavailable */
  }
}

/** Stable per-browser id used to attribute offline records to a device. */
export async function getDeviceId() {
  const existing = await getMeta<string>('device_id');
  if (existing) return existing;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await setMeta('device_id', generated);
  return generated;
}

/* --------------------------------------------------------------- catalog */

export async function cacheRecords(store: CacheStore, rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(store, 'readwrite');
    await Promise.all(rows.filter((row) => row?.id).map((row) => tx.store.put(row)));
    await tx.done;
    await setMeta(`${store}_cached_at`, Date.now());
  } catch {
    /* ignore */
  }
}

export async function replaceCachedRecords(
  store: CacheStore,
  businessId: string,
  rows: any[],
) {
  try {
    const db = await getDb();
    const tx = db.transaction(store, 'readwrite');
    const existing = await tx.store.getAll();
    await Promise.all(
      existing
        .filter((row: any) => row?.business_id === businessId && row?.id)
        .map((row: any) => tx.store.delete(row.id)),
    );
    await Promise.all(
      rows.filter((row) => row?.id).map((row) => tx.store.put({ ...row, business_id: businessId })),
    );
    await tx.done;
    await setMeta(`${store}_cached_at`, Date.now());
  } catch {
    /* cache is a best-effort fallback */
  }
}

export async function readCachedRecords<T = any>(
  store: CacheStore,
  businessId?: string | null,
): Promise<T[]> {
  try {
    const db = await getDb();
    const rows = (await db.getAll(store)) as Array<T & { business_id?: string }>;
    if (!businessId) return [];
    return rows.filter((row) => row.business_id === businessId) as T[];
  } catch {
    return [];
  }
}

/* ----------------------------------------------------------------- queue */

export async function putQueueItem(item: QueueItem) {
  const db = await getDb();
  await db.put(STORE_QUEUE, { ...item, updatedAt: Date.now() });
}

export async function readQueue(scope?: { actorId?: string | null; businessId?: string | null }): Promise<QueueItem[]> {
  try {
    const db = await getDb();
    let rows = (await db.getAll(STORE_QUEUE)) as QueueItem[];
    if (scope?.businessId) rows = rows.filter((row) => row.businessId === scope.businessId);
    if (scope?.actorId) {
      rows = rows.filter(
        (row) => row.actorId === scope.actorId || (!row.actorId && row.ownerId === scope.actorId),
      );
    }
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function deleteQueueItem(id: string) {
  try {
    const db = await getDb();
    await db.delete(STORE_QUEUE, id);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------- local sales */

export async function saveLocalSale(record: LocalSaleRecord) {
  try {
    const db = await getDb();
    await db.put(STORE_LOCAL_SALES, record);
  } catch {
    /* ignore */
  }
}

export async function readLocalSales(scope?: {
  actorId?: string | null;
  businessId?: string | null;
}): Promise<LocalSaleRecord[]> {
  try {
    const db = await getDb();
    let rows = (await db.getAll(STORE_LOCAL_SALES)) as LocalSaleRecord[];
    if (scope?.businessId) rows = rows.filter((row) => row.businessId === scope.businessId);
    if (scope?.actorId) {
      rows = rows.filter(
        (row) => row.actorId === scope.actorId || (!row.actorId && row.ownerId === scope.actorId),
      );
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function markLocalSaleSynced(id: string, serverId: string) {
  try {
    const db = await getDb();
    const row = (await db.get(STORE_LOCAL_SALES, id)) as LocalSaleRecord | undefined;
    if (row) await db.put(STORE_LOCAL_SALES, { ...row, serverId });
  } catch {
    /* ignore */
  }
}

/** Clears local business records when a caller explicitly requests a device reset. */
export async function clearOfflineData() {
  try {
    const db = await getDb();
    await Promise.all(
      [STORE_PRODUCTS, STORE_CUSTOMERS, STORE_EXPENSES, STORE_INCOME, STORE_QUEUE, STORE_LOCAL_SALES]
        .map((store) => db.clear(store)),
    );
  } catch {
    /* ignore */
  }
}
