import { useEffect, useState } from 'react';
import {
  discardItem,
  getSyncState,
  retryAll,
  retryItem,
  setOfflineSyncScope,
  startOfflineSync,
  subscribeToSync,
  syncNow,
  type SyncState,
} from '@/lib/offline-sync';

/** React binding for the global offline sync engine. */
export function useOfflineSync(actorId?: string | null, businessId?: string | null) {
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => {
    setOfflineSyncScope(actorId, businessId);
    startOfflineSync();
    const unsubscribe = subscribeToSync(setState);
    return () => {
      unsubscribe();
      setOfflineSyncScope(null, null);
    };
  }, [actorId, businessId]);


  return {
    ...state,
    syncNow,
    retryItem,
    retryAll,
    discardItem,
  };
}
