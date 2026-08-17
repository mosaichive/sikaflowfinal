import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, Search, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { CurrencyDef, searchCurrencies } from '@/lib/currency';
import { refreshExchangeRates } from '@/lib/exchange-rates';

type RateRow = {
  base_currency: string;
  target_currency: string;
  rate: number;
  provider: string;
  fetched_at: string;
};

export default function CurrencyManagementPage() {
  const { toast } = useToast();
  const [currencies, setCurrencies] = useState<CurrencyDef[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const defaultCode = currencies.find((c) => c.is_default)?.code ?? 'GHS';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = supabase as any;
      const [{ data: currencyRows }, { data: rateRows }, { data: profileRows }] = await Promise.all([
        db.from('currencies').select('*').order('sort_order', { ascending: true }),
        db.from('exchange_rates').select('base_currency, target_currency, rate, provider, fetched_at').eq('base_currency', 'GHS'),
        db.from('profiles').select('currency'),
      ]);
      setCurrencies((currencyRows ?? []) as CurrencyDef[]);
      setRates((rateRows ?? []) as RateRow[]);
      const counts: Record<string, number> = {};
      (profileRows ?? []).forEach((row: any) => {
        const code = row.currency || 'GHS';
        counts[code] = (counts[code] ?? 0) + 1;
      });
      setUsage(counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rateMap = useMemo(() => {
    const map = new Map<string, RateRow>();
    rates.forEach((r) => map.set(r.target_currency, r));
    return map;
  }, [rates]);

  const lastUpdated = useMemo(() => {
    const stamps = rates.map((r) => new Date(r.fetched_at).getTime()).filter(Boolean);
    return stamps.length ? new Date(Math.max(...stamps)) : null;
  }, [rates]);

  const filtered = useMemo(() => searchCurrencies(currencies, query), [currencies, query]);

  const toggleActive = async (code: string, active: boolean) => {
    const inUse = (usage[code] ?? 0) > 0;
    const { error } = await (supabase as any).from('currencies').update({ active }).eq('code', code);
    if (error) {
      toast({ title: 'Could not update currency', description: error.message, variant: 'destructive' });
      return;
    }
    setCurrencies((prev) => prev.map((c) => (c.code === code ? { ...c, active } : c)));
    toast({
      title: active ? `${code} enabled` : `${code} disabled`,
      description: !active && inUse
        ? `${usage[code]} business(es) already using ${code} keep working — new businesses can no longer select it.`
        : undefined,
    });
  };

  const makeDefault = async (code: string) => {
    const db = supabase as any;
    const { error: clearError } = await db.from('currencies').update({ is_default: false }).eq('is_default', true);
    if (clearError) {
      toast({ title: 'Could not set default', description: clearError.message, variant: 'destructive' });
      return;
    }
    const { error } = await db.from('currencies').update({ is_default: true, active: true }).eq('code', code);
    if (error) {
      toast({ title: 'Could not set default', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
    toast({ title: `${code} is now the default system currency` });
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    try {
      await refreshExchangeRates('GHS');
      await load();
      toast({ title: 'Exchange rates refreshed' });
    } catch (error: any) {
      toast({
        title: 'Rate provider unavailable',
        description: `${error.message}. The last saved rates are still in use.`,
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Coins className="h-6 w-6 text-primary" /> Currency Management</h1>
          <p className="text-sm text-muted-foreground">
            Control which currencies businesses can operate in and monitor live exchange rates.
          </p>
        </div>
        <Button onClick={handleRefreshRates} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh rates
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Supported currencies</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{currencies.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Default system currency</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{defaultCode}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Rates last updated</CardTitle></CardHeader>
          <CardContent className="text-sm font-medium">
            {lastUpdated ? lastUpdated.toLocaleString() : 'Never — refresh to fetch rates'}
            {rates[0]?.provider && <span className="block text-xs text-muted-foreground">Provider: {rates[0].provider}</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Currencies</CardTitle>
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search currency…" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading currencies…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Decimals</TableHead>
                  <TableHead>Rate (1 GHS)</TableHead>
                  <TableHead>Businesses</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead className="text-right">Default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const rate = rateMap.get(c.code);
                  const inUse = usage[c.code] ?? 0;
                  return (
                    <TableRow key={c.code}>
                      <TableCell className="font-medium">{c.flag ? `${c.flag} ` : ''}{c.name}</TableCell>
                      <TableCell>{c.code}</TableCell>
                      <TableCell>{c.symbol}</TableCell>
                      <TableCell>{c.decimals}</TableCell>
                      <TableCell className="tabular-nums">
                        {rate ? Number(rate.rate).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'}
                      </TableCell>
                      <TableCell>{inUse > 0 ? <Badge variant="secondary">{inUse}</Badge> : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell>
                        <Switch
                          checked={c.active}
                          disabled={c.is_default}
                          onCheckedChange={(v) => toggleActive(c.code, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {c.is_default ? (
                          <Badge className="gap-1"><Star className="h-3 w-3" /> Default</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => makeDefault(c.code)}>Set default</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Disabling a currency only hides it from new businesses. Businesses already using it keep operating normally and all
            historical records stay intact.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
