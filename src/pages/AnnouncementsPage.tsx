import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Bell, Info, Megaphone } from 'lucide-react';
import { logSupabaseError } from '@/lib/workspace';

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'critical';
  audience: string;
  publish_at: string;
  created_at: string;
};

function getLevelIcon(p: AnnouncementRow['priority']) {
  if (p === 'critical') return AlertTriangle;
  if (p === 'high') return Megaphone;
  return Info;
}

function getLevelTone(p: AnnouncementRow['priority']) {
  if (p === 'critical') return { border: 'border-destructive/30', badge: 'destructive' as const, icon: 'text-destructive' };
  if (p === 'high') return { border: 'border-amber-500/30', badge: 'secondary' as const, icon: 'text-amber-500' };
  return { border: 'border-primary/20', badge: 'outline' as const, icon: 'text-primary' };
}

const readKey = (userId: string, id: string) => `ann_read_${userId}_${id}`;

export default function AnnouncementsPage() {
  const { user, role } = useAuth();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [readVersion, setReadVersion] = useState(0);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,message,priority,audience,publish_at,created_at')
      .lte('publish_at', new Date().toISOString())
      .order('publish_at', { ascending: false });

    if (error) {
      logSupabaseError('tenantAnnouncements.load', error, { userId: user.id });
    }
    setRows(((data || []) as unknown) as AnnouncementRow[]);
  }, [user]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`tenant-announcements-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  // Mark all visible announcements as read for this user
  useEffect(() => {
    if (!user || rows.length === 0) return;
    let changed = false;
    rows.forEach((row) => {
      const key = readKey(user.id, row.id);
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, new Date().toISOString());
        changed = true;
      }
    });
    if (changed) {
      window.dispatchEvent(new Event('announcements:read'));
      setReadVersion((v) => v + 1);
    }
  }, [rows, user]);

  const readIds = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set(rows.filter((r) => localStorage.getItem(readKey(user.id, r.id))).map((r) => r.id));
    // readVersion is intentionally part of deps to refresh after marking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, user, readVersion]);

  return (
    <AppLayout title="Announcements">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
            <p className="text-sm text-muted-foreground">
              Platform notices from KudiTrack for your workspace. This page is read-only for {role === 'admin' ? 'tenant admins' : 'team members'}.
            </p>
          </div>
        </section>

        <Card className="border-border/70">
          <CardContent className="space-y-4 p-4">
            {rows.length > 0 ? (
              rows.map((row) => {
                const Icon = getLevelIcon(row.priority);
                const tone = getLevelTone(row.priority);
                const isRead = readIds.has(row.id);
                return (
                  <article key={row.id} className={`rounded-2xl border bg-card/50 p-4 transition-colors ${tone.border}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 rounded-2xl bg-primary/10 p-2">
                          <Icon className={`h-4 w-4 ${tone.icon}`} />
                        </span>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{row.title}</p>
                            <Badge variant={tone.badge}>{row.priority}</Badge>
                            <Badge variant={isRead ? 'secondary' : 'default'}>{isRead ? 'Read' : 'New'}</Badge>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.message}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{new Date(row.publish_at || row.created_at).toLocaleDateString('en-GH')}</p>
                        <p className="mt-1 uppercase tracking-[0.14em]">{(row.audience || 'all').replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                icon={<Bell className="h-7 w-7 text-muted-foreground" />}
                title="No announcements right now"
                description="When KudiTrack sends updates for your workspace, they will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
