import { useEffect, useState } from 'react';
import {
  discardItem,
  getSyncState,
  retryAll,
  retryItem,
  startOfflineSync,
  subscribeToSync,
  syncNow,
  type SyncState,
} from '@/lib/offline-sync';

/** React binding for the global offline sync engine. */
export function useOfflineSync() {
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => {
    startOfflineSync();
    const unsubscribe = subscribeToSync(setState);
    return () => {
      unsubscribe();
    };
  }, []);


  return {
    ...state,
    syncNow,
    retryItem,
    retryAll,
    discardItem,
  };
}
