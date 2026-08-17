import { useEffect, useState } from 'react';
import { Coins, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CurrencySelect } from '@/components/CurrencySelect';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fetchExchangeRate } from '@/lib/exchange-rates';
import { convertBusinessRecords } from '@/lib/currency-conversion';
import { formatMoney, getCurrency } from '@/lib/currency';

export function CurrencyCard({ canManage }: { canManage: boolean }) {
  const { code, currency, activeCurrencies, setBusinessCurrency, refresh } = useCurrency();
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();

  const [selected, setSelected] = useState(code);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [rateStale, setRateStale] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [mode, setMode] = useState<'keep' | 'convert'>('keep');
  const [saving, setSaving] = useState(false);

  useEffect(() => setSelected(code), [code]);

  const target = getCurrency(selected);

  const openConfirm = async () => {
    if (selected === code) return;
    setConfirmOpen(true);
    setMode('keep');
    setRateLoading(true);
    const result = await fetchExchangeRate(code, selected);
    setRate(result.rate);
    setRateStale(result.stale);
    setRateLoading(false);
  };

  const handleConfirm = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      let conversionNote = 'Historical records kept in their original amounts.';
      if (mode === 'convert') {
        if (!rate) throw new Error('An exchange rate is required to convert historical records.');
        const summaries = await convertBusinessRecords(user.id, rate, target.decimals ?? 2);
        const converted = summaries.reduce((sum, s) => sum + s.rows, 0);
        const failed = summaries.filter((s) => s.error).map((s) => s.table);
        conversionNote = `Converted ${converted} record(s) at ${rate}.${failed.length ? ` Skipped: ${failed.join(', ')}.` : ''}`;
      }

      await setBusinessCurrency(selected);

      await (supabase as any).from('audit_log').insert({
        user_id: user.id,
        action: 'currency_changed',
        details: `${code} → ${selected}. Rate: ${rate ?? 'n/a'}${rateStale ? ' (cached)' : ''}. ${conversionNote}`,
        performed_by: user.id,
        performed_by_name: profile?.display_name || profile?.business_name || user.email || null,
      });

      await refresh();
      toast({ title: `Business currency set to ${selected}`, description: conversionNote });
      setConfirmOpen(false);
    } catch (error: any) {
      toast({ title: 'Could not change currency', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Business Currency</CardTitle>
        <CardDescription>
          Every amount across the dashboard, sales, inventory, reports, receipts, and invoices is shown in this currency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current:</span>
          <Badge variant="secondary">
            {currency.flag ? `${currency.flag} ` : ''}{currency.name} ({currency.code}) {currency.symbol}
          </Badge>
          <span className="text-muted-foreground">Example: {formatMoney(1250.5, code)}</span>
        </div>

        <div className="space-y-2">
          <Label>Change currency</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <CurrencySelect
              value={selected}
              onChange={setSelected}
              currencies={activeCurrencies}
              disabled={!canManage}
              className="sm:max-w-sm"
            />
            <Button onClick={openConfirm} disabled={!canManage || selected === code}>Change currency</Button>
          </div>
          {!canManage && (
            <p className="text-xs text-muted-foreground">Only the business owner or an admin can change the currency.</p>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change currency from {code} to {selected}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  {rateLoading ? (
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Fetching live exchange rate…</span>
                  ) : rate ? (
                    <>Live rate: <strong>1 {code} = {rate.toLocaleString('en-US', { maximumFractionDigits: 6 })} {selected}</strong>
                      {rateStale && <span className="ml-2 inline-flex items-center gap-1 text-warning"><TriangleAlert className="h-3 w-3" /> cached rate</span>}
                    </>
                  ) : (
                    <span className="flex items-center gap-2 text-destructive">
                      <TriangleAlert className="h-4 w-4" /> Exchange rate unavailable — you can still switch and keep historical amounts.
                    </span>
                  )}
                </p>

                <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'keep' | 'convert')} className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="keep" className="mt-1" />
                    <span>
                      <span className="block font-medium text-foreground">Keep historical records (recommended)</span>
                      <span className="block text-xs">Past amounts stay exactly as recorded. Only new entries use {selected}.</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="convert" className="mt-1" disabled={!rate} />
                    <span>
                      <span className="block font-medium text-foreground">Convert existing records</span>
                      <span className="block text-xs">
                        Multiply every stored amount by the rate above. Quantities and history are preserved and the change is logged.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleConfirm(); }} disabled={saving || rateLoading}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…</> : <><RefreshCw className="mr-2 h-4 w-4" /> Confirm change</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
