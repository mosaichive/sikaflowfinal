import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BackupFile,
  BackupSummary,
  RestoreMode,
  readBackupFile,
  restoreBackup,
} from '@/lib/backup';

interface RestoreBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true the account already holds data, so merge/replace choices matter. */
  hasExistingData?: boolean;
  /** Restore triggered from onboarding — defaults to a clean restore. */
  onboarding?: boolean;
  onRestored?: () => void;
}

const COUNT_LABELS: Record<string, string> = {
  branches: 'Branches',
  products: 'Products',
  inventory: 'Stock entries',
  customers: 'Customers',
  sales: 'Sales',
  orders: 'Orders',
  expenses: 'Expenses',
  other_income: 'Other income',
  savings: 'Savings',
  investments: 'Investments',
  staff: 'Team members',
};

export function RestoreBackupDialog({
  open, onOpenChange, hasExistingData = false, onboarding = false, onRestored,
}: RestoreBackupDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>('fresh');
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Record<string, number> | null>(null);

  const reset = () => {
    setBackup(null); setSummary(null); setFileName(''); setError(null);
    setMode('fresh'); setRestoring(false); setProgress(0); setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = (next: boolean) => {
    if (restoring) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setError(null); setDone(null);
    setFileName(file.name);
    const result = await readBackupFile(file);
    if (result.ok === false) {
      setBackup(null); setSummary(null); setError(result.error);
      return;
    }
    setBackup(result.backup);
    setSummary(result.summary);
  };

  const handleRestore = async () => {
    if (!backup) return;
    setRestoring(true);
    setProgress(10);
    const timer = window.setInterval(() => setProgress((p) => (p < 85 ? p + 5 : p)), 400);
    try {
      const result = await restoreBackup(backup, mode);
      setProgress(100);
      setDone(result.restored || {});
      toast({ title: 'Restore complete', description: 'Your business data has been restored.' });
      onRestored?.();
    } catch (err: any) {
      setError(err?.message || 'Restore failed. No changes were made to your account.');
      toast({ title: 'Restore failed', description: 'No changes were made to your account.', variant: 'destructive' });
    } finally {
      window.clearInterval(timer);
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore from backup</DialogTitle>
          <DialogDescription>
            Upload a <span className="font-mono">.kuditrack</span> backup file to bring your business data into this account.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-5 w-5" /> Restore completed successfully
            </div>
            <div className="rounded-lg border border-border/70 p-3 text-sm">
              {Object.entries(done).filter(([, v]) => Number(v) > 0).map(([key, value]) => (
                <div key={key} className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">{COUNT_LABELS[key] || key.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".kuditrack,.json,application/json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={restoring}>
              <FileUp className="mr-2 h-4 w-4" />
              {fileName || 'Choose backup file'}
            </Button>

            {error && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {summary && (
              <div className="space-y-3 rounded-lg border border-border/70 p-3">
                <div className="text-sm">
                  <p className="font-semibold">{summary.businessName}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.createdAt ? `Backed up ${new Date(summary.createdAt).toLocaleString()}` : 'Backup date unknown'}
                    {' · '}Currency {summary.currency}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-sm">
                  {Object.entries(summary.counts).filter(([, v]) => v > 0).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">{COUNT_LABELS[key] || key}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary && !onboarding && (
              <div className="space-y-2">
                <Label className="text-sm">How should this data be applied?</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as RestoreMode)} className="space-y-2">
                  <label className="flex items-start gap-2 rounded-lg border border-border/70 p-3 cursor-pointer">
                    <RadioGroupItem value="fresh" className="mt-0.5" />
                    <span className="text-sm">
                      <span className="block font-medium">Replace current data</span>
                      <span className="text-xs text-muted-foreground">Clears this business first, then restores the backup exactly as it was.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border border-border/70 p-3 cursor-pointer">
                    <RadioGroupItem value="merge" className="mt-0.5" />
                    <span className="text-sm">
                      <span className="block font-medium">Merge with current data</span>
                      <span className="text-xs text-muted-foreground">Keeps what you have and skips records already restored before.</span>
                    </span>
                  </label>
                </RadioGroup>
                {mode === 'fresh' && hasExistingData && (
                  <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Existing sales, products, customers and records in this account will be permanently deleted before the restore. Download a backup first if you need one.</span>
                  </div>
                )}
              </div>
            )}

            {restoring && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Restoring your data — please keep this window open.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => handleClose(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={restoring}>Cancel</Button>
              <Button onClick={handleRestore} disabled={!backup || restoring}>
                {restoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Restore data
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
