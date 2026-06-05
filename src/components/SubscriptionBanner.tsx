import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertTriangle, Megaphone, X, Info } from 'lucide-react';
import { useSubscription, PLAN_LABELS } from '@/context/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
}

const dismissedKey = (id: string) => `ann_dismissed_${id}`;

export function SubscriptionBanner({ showAnnouncements = true }: { showAnnouncements?: boolean }) {
  const { subscription, daysRemaining, hasAccess, isReadOnly } = useSubscription();
  const [anns, setAnns] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!showAnnouncements) {
      setAnns([]);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id,title,message,priority')
        .lte('publish_at', new Date().toISOString())
        .order('publish_at', { ascending: false })
        .limit(5);
      const list = ((data ?? []) as unknown) as Announcement[];
      setAnns(list.filter((a) => !localStorage.getItem(dismissedKey(a.id))));
    })();
  }, [showAnnouncements]);

  const dismiss = (id: string) => {
    localStorage.setItem(dismissedKey(id), '1');
    setAnns((cur) => cur.filter((a) => a.id !== id));
  };

  const showTrialBanner =
    subscription?.status === 'trial' && daysRemaining !== null && daysRemaining <= 7 && hasAccess;
  const showExpired = !hasAccess && isReadOnly;

  if (!showTrialBanner && !showExpired && anns.length === 0) return null;

  return (
    <div className="space-y-2">
      {showExpired && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-foreground">
              {subscription?.status === 'trial'
                ? 'Your 30-day free trial has ended'
                : `Your ${subscription ? PLAN_LABELS[subscription.plan as keyof typeof PLAN_LABELS] : 'subscription'} has ended.`}
            </p>
            <p className="text-muted-foreground mt-0.5">
              Your records are still safe. Upgrade now to restore full access.
            </p>
          </div>
          <Button asChild size="sm" variant="default"><Link to="/billing">Upgrade</Link></Button>
        </div>
      )}

      {showTrialBanner && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-foreground">
              {daysRemaining! <= 1
                ? 'Your free trial ends today'
                : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your free trial`}
            </p>
            <p className="text-muted-foreground mt-0.5">
              Upgrade to keep all features after your trial ends.
            </p>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/billing">Upgrade</Link></Button>
        </div>
      )}

      {anns.map((a) => {
        const tone =
          a.priority === 'critical' ? 'border-destructive/40 bg-destructive/5'
          : a.priority === 'high' ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border bg-muted/30';
        const Icon = a.priority === 'critical' ? AlertTriangle : a.priority === 'high' ? Megaphone : Info;
        const iconColor =
          a.priority === 'critical' ? 'text-destructive'
          : a.priority === 'high' ? 'text-amber-500'
          : 'text-primary';
        return (
          <div key={a.id} className={cn('rounded-lg border p-3 flex items-start gap-3', tone)}>
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconColor)} />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-foreground">{a.title}</p>
              {a.message && <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.message}</p>}
            </div>
            <button onClick={() => dismiss(a.id)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
