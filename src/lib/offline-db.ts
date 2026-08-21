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
const DB_VERSION = 1;

export const STORE_META = 'meta';
export const STORE_PRODUCTS = 'products';
export const STORE_CUSTOMERS = 'customers';
export const STORE_QUEUE = 'queue';
export const STORE_LOCAL_SALES = 'local_sales';

export type QueueKind = 'sale' | 'customer' | 'expense' | 'income';

export type QueueStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export type QueueItem = {
  /** Client transaction id — the idempotency key sent to the server. */
  id: string;
  kind: QueueKind;
  ownerId: string;
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
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
          db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queue = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
          queue.createIndex('status', 'status');
          queue.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STORE_LOCAL_SALES)) {
          const sales = db.createObjectStore(STORE_LOCAL_SALES, { keyPath: 'id' });
          sales.createIndex('createdAt', 'createdAt');
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

export async function cacheRecords(store: typeof STORE_PRODUCTS | typeof STORE_CUSTOMERS, rows: any[]) {
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

export async function readCachedRecords<T = any>(
  store: typeof STORE_PRODUCTS | typeof STORE_CUSTOMERS,
): Promise<T[]> {
  try {
    const db = await getDb();
    return (await db.getAll(store)) as T[];
  } catch {
    return [];
  }
}

/* ----------------------------------------------------------------- queue */

export async function putQueueItem(item: QueueItem) {
  const db = await getDb();
  await db.put(STORE_QUEUE, { ...item, updatedAt: Date.now() });
}

export async function readQueue(): Promise<QueueItem[]> {
  try {
    const db = await getDb();
    const rows = (await db.getAll(STORE_QUEUE)) as QueueItem[];
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

export async function readLocalSales(): Promise<LocalSaleRecord[]> {
  try {
    const db = await getDb();
    const rows = (await db.getAll(STORE_LOCAL_SALES)) as LocalSaleRecord[];
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

/** Clears every offline artefact — used on sign-out so devices aren't shared. */
export async function clearOfflineData() {
  try {
    const db = await getDb();
    await Promise.all(
      [STORE_PRODUCTS, STORE_CUSTOMERS, STORE_QUEUE, STORE_LOCAL_SALES].map((store) => db.clear(store)),
    );
  } catch {
    /* ignore */
  }
}
