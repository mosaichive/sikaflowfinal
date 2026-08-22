import { useState } from 'react';
import { AlertTriangle, Check, CloudOff, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const { online, syncing, pending, failed, conflicts, items, lastSyncedAt, syncNow, retryItem, retryAll, discardItem } =
    useOfflineSync();
  const { formatCurrency } = useCurrency();

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
    ? 'Offline — work is saved on this device'
    : needsAttention > 0
      ? `${needsAttention} item${needsAttention === 1 ? '' : 's'} need attention`
      : pending > 0
        ? `Syncing ${pending} item${pending === 1 ? '' : 's'}`
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
                          item.status === 'failed' || item.status === 'conflict' ? 'destructive' : 'secondary'
                        }
                        className="shrink-0 capitalize"
                      >
                        {item.status}
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
      </PopoverContent>
    </Popover>
  );
}
