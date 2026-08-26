import { useState } from 'react';
import { AlertTriangle, Check, CloudOff, CloudUpload, Clock, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { formatCurrency } from '@/lib/constants';
import { cn } from '@/lib/utils';

function relativeTime(ts: number | null) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function OfflineSyncIndicator() {
  const [open, setOpen] = useState(false);
  const {
    online,
    syncing,
    pending,
    failed,
    conflicts,
    items,
    lastSyncedAt,
    progress,
    recentlySynced,
    syncNow,
    retryItem,
    retryAll,
    discardItem,
  } = useOfflineSync();

  const uploaded = progress ? progress.done : 0;
  const uploadTotal = progress ? progress.total : 0;
  const percent = uploadTotal > 0 ? Math.round((uploaded / uploadTotal) * 100) : 0;


  const needsAttention = failed + conflicts;
  const queued = pending + needsAttention;

  // Fully synced and online: stay out of the way with a quiet tick.
  const tone = !online
    ? 'text-amber-600 bg-amber-500/10'
    : needsAttention > 0
      ? 'text-destructive bg-destructive/10'
      : pending > 0
        ? 'text-primary bg-primary/10'
        : 'text-muted-foreground';

  const Icon = !online ? CloudOff : needsAttention > 0 ? AlertTriangle : pending > 0 ? RefreshCw : Wifi;

  const statusLabel = !online
    ? queued > 0
      ? `Offline — ${queued} change${queued === 1 ? '' : 's'} waiting on this device`
      : 'Offline — work is saved on this device'
    : needsAttention > 0
      ? `${needsAttention} item${needsAttention === 1 ? '' : 's'} need attention`
      : progress
        ? `Uploading ${Math.min(uploaded + 1, uploadTotal)} of ${uploadTotal}`
        : pending > 0
          ? `${pending} item${pending === 1 ? '' : 's'} waiting to upload`
          : 'All changes synced';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={statusLabel}
          title={statusLabel}
          className={cn(
            'relative rounded-lg p-2 transition-all duration-200 hover:bg-secondary active:scale-95',
            tone,
          )}
        >
          <Icon className={cn('h-4 w-4', syncing && 'animate-spin')} />
          {queued > 0 ? (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                needsAttention > 0
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {queued > 9 ? '9+' : queued}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-start justify-between gap-2 border-b border-border p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
            <p className="text-xs text-muted-foreground">Last synced {relativeTime(lastSyncedAt)}</p>
          </div>
          <Button size="sm" variant="outline" disabled={!online || syncing} onClick={() => void syncNow()}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', syncing && 'animate-spin')} />
            Sync
          </Button>
        </div>

        {progress ? (
          <div className="space-y-1.5 border-b border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <CloudUpload className="h-3.5 w-3.5 text-primary" />
                Uploading {Math.min(uploaded + 1, uploadTotal)} of {uploadTotal}
              </span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>
            <Progress value={percent} className="h-1.5" />
            {progress.currentLabel ? (
              <p className="truncate text-[11px] text-muted-foreground">{progress.currentLabel}</p>
            ) : null}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Check className="h-6 w-6 text-primary" />
            <p className="text-sm text-muted-foreground">
              Nothing waiting to sync. You can keep selling even without internet — everything will upload
              automatically when you reconnect.
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-72">
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                          {item.amount ? ` · ${formatCurrency(item.amount)}` : ''}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.status === 'failed' || item.status === 'conflict'
                            ? 'destructive'
                            : item.status === 'syncing'
                              ? 'default'
                              : 'secondary'
                        }
                        className="shrink-0"
                      >
                        {item.status === 'syncing'
                          ? 'Uploading'
                          : item.status === 'pending'
                            ? online
                              ? 'Waiting'
                              : 'Saved offline'
                            : item.status === 'conflict'
                              ? 'Conflict'
                              : 'Failed'}
                      </Badge>
                    </div>
                    {item.lastError ? (
                      <p className="text-xs text-destructive">{item.lastError}</p>
                    ) : null}
                    {item.status === 'failed' || item.status === 'conflict' ? (
                      <div className="flex gap-2 pt-0.5">
                        <Button size="sm" variant="outline" onClick={() => void retryItem(item.id)}>
                          Retry
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void discardItem(item.id)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Discard
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {needsAttention > 0 ? (
              <div className="border-t border-border p-3">
                <Button size="sm" variant="secondary" className="w-full" onClick={() => void retryAll()}>
                  Retry all {needsAttention} item{needsAttention === 1 ? '' : 's'}
                </Button>
              </div>
            ) : null}
          </>
        )}
        {recentlySynced.length > 0 ? (
          <div className="border-t border-border p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Just uploaded
            </p>
            <ul className="space-y-1">
              {recentlySynced.map((entry) => (
                <li key={`${entry.id}-${entry.at}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{entry.label}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {relativeTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
