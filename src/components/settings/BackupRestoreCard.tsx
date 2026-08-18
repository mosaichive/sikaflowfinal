import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Database, Download, History, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { buildBackup, downloadBackup, hasExistingBusinessData } from '@/lib/backup';
import { RestoreBackupDialog } from '@/components/settings/RestoreBackupDialog';

interface RestoreLog {
  id: string;
  backup_business_name: string | null;
  restore_mode: string;
  status: string;
  restored_counts: Record<string, number>;
  created_at: string;
}

export function BackupRestoreCard({ ownerId, businessName }: { ownerId: string | null; businessName: string }) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [logs, setLogs] = useState<RestoreLog[]>([]);

  const loadLogs = async () => {
    const { data } = await supabase
      .from('restore_logs').select('*').order('created_at', { ascending: false }).limit(10);
    setLogs((data || []) as any);
  };

  useEffect(() => {
    if (!ownerId) return;
    void loadLogs();
    void hasExistingBusinessData(ownerId).then(setHasData);
  }, [ownerId]);

  const handleDownload = async () => {
    if (!ownerId) return;
    setDownloading(true);
    try {
      const backup = await buildBackup(ownerId);
      downloadBackup(backup, businessName);
      toast({ title: 'Backup downloaded', description: 'Keep this file somewhere safe — it contains your business data.' });
    } catch (err: any) {
      toast({ title: 'Backup failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" />Backup &amp; Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download a complete copy of <span className="font-medium text-foreground">{businessName}</span> — products, stock, sales, orders,
            customers, expenses, income, savings and settings — as a secure <span className="font-mono">.kuditrack</span> file.
            You can restore it later into this account or a brand new one.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload} disabled={downloading || !ownerId}>
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download my data
            </Button>
            <Button variant="outline" onClick={() => setRestoreOpen(true)} disabled={!ownerId}>
              <Upload className="mr-2 h-4 w-4" />Restore from backup
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Backups never include passwords, payment credentials or other users&apos; data.
          </p>

          <div className="pt-2">
            <p className="text-sm font-medium flex items-center gap-2 mb-2"><History className="h-4 w-4" />Restore history</p>
            {logs.length > 0 ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Backup</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{log.backup_business_name || '—'}</TableCell>
                      <TableCell className="text-xs capitalize">{log.restore_mode.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'}>{log.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No restores yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <RestoreBackupDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        hasExistingData={hasData}
        onRestored={() => { void loadLogs(); window.setTimeout(() => window.location.reload(), 1200); }}
      />
    </>
  );
}
