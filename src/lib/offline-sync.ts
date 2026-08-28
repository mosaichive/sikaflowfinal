import { supabase } from '@/integrations/supabase/client';
import {
  deleteQueueItem,
  getDeviceId,
  getMeta,
  offlineStorageAvailable,
  putQueueItem,
  readQueue,
  setMeta,
  markLocalSaleSynced,
  type QueueItem,
  type QueueKind,
} from '@/lib/offline-db';

/**
 * Durable sync engine.
 *
 * Every offline write becomes a queue item with a client-generated
 * `client_txn_id`. The server RPCs are idempotent on that key, so retries after
 * a dropped connection, a reload or a duplicate tab can never double-post.
 */

const RPC_BY_KIND: Record<QueueKind, string> = {
  sale: 'sync_offline_sale',
  customer: 'sync_offline_customer',
  expense: 'sync_offline_expense',
  income: 'sync_offline_income',
};

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 4_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export type SyncProgress = {
  /** Items in the current upload pass. */
  total: number;
  /** Items finished (successfully or not) in the current pass. */
  done: number;
  /** Label of the item currently uploading. */
  currentLabel: string | null;
  currentId: string | null;
};

export type SyncedRecently = {
  id: string;
  label: string;
  amount: number;
  at: number;
};

export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  items: QueueItem[];
  lastSyncedAt: number | null;
  supported: boolean;
  /** Live per-pass upload progress, or null when idle. */
  progress: SyncProgress | null;
  /** Items that finished uploading in the last few minutes (newest first). */
  recentlySynced: SyncedRecently[];
};

type Listener = (state: SyncState) => void;

let state: SyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  failed: 0,
  conflicts: 0,
  items: [],
  lastSyncedAt: null,
  supported: offlineStorageAvailable(),
  progress: null,
  recentlySynced: [],
};

const RECENT_KEEP = 6;
const RECENT_TTL_MS = 5 * 60_000;

function rememberSynced(entry: SyncedRecently) {
  const now = Date.now();
  setState({
    recentlySynced: [entry, ...state.recentlySynced.filter((r) => now - r.at < RECENT_TTL_MS)].slice(0, RECENT_KEEP),
  });
}

const listeners = new Set<Listener>();
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let runningPass: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener(state);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  emit();
}

async function refreshFromStore() {
  const items = await readQueue();
  setState({
    items,
    pending: items.filter((i) => i.status === 'pending' || i.status === 'syncing').length,
    failed: items.filter((i) => i.status === 'failed').length,
    conflicts: items.filter((i) => i.status === 'conflict').length,
  });
}

export function getSyncState() {
  return state;
}

export function subscribeToSync(listener: Listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function backoffFor(attempts: number) {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

function newTxnId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `txn_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** Queue an operation for the server. Safe to call while online or offline. */
export async function enqueueOperation(input: {
  kind: QueueKind;
  ownerId: string;
  businessId?: string | null;
  payload: Record<string, unknown>;
  label: string;
  amount?: number;
  clientTxnId?: string;
}) {
  const deviceId = await getDeviceId();
  const id = input.clientTxnId ?? newTxnId();
  const item: QueueItem = {
    id,
    kind: input.kind,
    ownerId: input.ownerId,
    businessId: input.businessId ?? null,
    deviceId,
    payload: {
      ...input.payload,
      owner_id: input.ownerId,
      client_txn_id: id,
      client_device_id: deviceId,
      created_offline: true,
    },
    label: input.label,
    amount: Number(input.amount ?? 0),
    status: 'pending',
    attempts: 0,
    lastError: null,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await putQueueItem(item);
  await refreshFromStore();
  void syncNow();
  return id;
}

async function processItem(item: QueueItem) {
  await putQueueItem({ ...item, status: 'syncing' });

  const { data, error } = await supabase.rpc(RPC_BY_KIND[item.kind] as any, {
    _payload: item.payload as any,
  });

  if (error) {
    const attempts = item.attempts + 1;
    // Permission / validation failures will never succeed on retry.
    const permanent =
      /not allowed|required|no items|violates|invalid input/i.test(error.message ?? '') ||
      attempts >= MAX_ATTEMPTS;
    await putQueueItem({
      ...item,
      status: permanent ? 'failed' : 'pending',
      attempts,
      lastError: error.message ?? 'Sync failed',
      nextAttemptAt: permanent ? 0 : Date.now() + backoffFor(attempts),
    });
    return;
  }

  const result = (data ?? {}) as Record<string, any>;
  if (result.status === 'conflict') {
    await putQueueItem({
      ...item,
      status: 'conflict',
      attempts: item.attempts + 1,
      lastError: result.message ?? 'This record conflicts with cloud data.',
      nextAttemptAt: 0,
    });
    return;
  }

  if (item.kind === 'sale' && result.sale_id) {
    await markLocalSaleSynced(item.id, String(result.sale_id));
  }
  await deleteQueueItem(item.id);
  await setMeta('last_synced_at', Date.now());
  rememberSynced({ id: item.id, label: item.label, amount: Number(item.amount ?? 0), at: Date.now() });
}

/** Drain the queue. Concurrent calls share one in-flight pass. */
export async function syncNow(): Promise<void> {
  if (!state.supported) return;
  if (runningPass) return runningPass;

  const pass = (async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return; // Signed out — keep the queue for later.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    setState({ syncing: true });
    try {
      const queue = await readQueue();
      const now = Date.now();
      const due = queue.filter(
        (item) =>
          (item.status === 'pending' || item.status === 'syncing') && item.nextAttemptAt <= now,
      );
      // Sequential on purpose: sales depend on customers created just before
      // them, and ordering keeps stock reconciliation deterministic.
      setState({
        progress: { total: due.length, done: 0, currentLabel: due[0]?.label ?? null, currentId: due[0]?.id ?? null },
      });

      let done = 0;
      for (const item of due) {
        setState({ progress: { total: due.length, done, currentLabel: item.label, currentId: item.id } });
        try {
          await processItem(item);
        } catch (err: any) {
          const attempts = item.attempts + 1;
          await putQueueItem({
            ...item,
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            attempts,
            lastError: err?.message ?? 'Unexpected sync error',
            nextAttemptAt: Date.now() + backoffFor(attempts),
          });
        }
        done += 1;
        setState({ progress: { total: due.length, done, currentLabel: null, currentId: null } });
        await refreshFromStore();
      }
      setState({ lastSyncedAt: (await getMeta<number>('last_synced_at')) ?? state.lastSyncedAt });
    } finally {
      setState({ syncing: false, progress: null });
      await refreshFromStore();
    }
  })();

  // Always release the guard, including the early-return paths above (signed
  // out / offline) which never reach the try/finally block.
  runningPass = pass.finally(() => {
    runningPass = null;
  });

  return runningPass;
}

/** Push a failed/conflicted item back into the queue for another attempt. */
export async function retryItem(id: string) {
  const queue = await readQueue();
  const item = queue.find((i) => i.id === id);
  if (!item) return;
  await putQueueItem({ ...item, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null });
  await refreshFromStore();
  void syncNow();
}

/** Permanently drop an item the user chose not to sync. */
export async function discardItem(id: string) {
  await deleteQueueItem(id);
  await refreshFromStore();
}

export async function retryAll() {
  const queue = await readQueue();
  for (const item of queue) {
    if (item.status === 'failed' || item.status === 'conflict') {
      await putQueueItem({ ...item, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null });
    }
  }
  await refreshFromStore();
  void syncNow();
}

/** Boot the engine once per app session. */
export function startOfflineSync() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const handleOnline = () => {
    setState({ online: true });
    void syncNow();
  };
  const handleOffline = () => setState({ online: false });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });

  void (async () => {
    setState({ lastSyncedAt: await getMeta<number>('last_synced_at') });
    await refreshFromStore();
    void syncNow();
  })();

  // Periodic drain covers flaky connections where no `online` event fires.
  timer = setInterval(() => {
    if (state.pending > 0) void syncNow();
  }, 30_000);
}

export function stopOfflineSync() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
