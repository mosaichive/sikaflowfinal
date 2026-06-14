import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Receipt, X, Paperclip, Trash2, WalletCards } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage, insertExpenseRecord, logSupabaseError } from '@/lib/workspace';

type ExpenseRow = {
  id: string;
  category: string;
  amount: number | string;
  expense_date: string;
  description: string | null;
  payment_method: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  recorded_by_name: string | null;
};

type ExpenseRowDraft = {
  id: string;
  category: string;
  description: string;
  amount: string;
  expense_date: string;
  payment_method: string;
  receipt: File | null;
};

const makeDraft = (): ExpenseRowDraft => ({
  id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Math.random()),
  category: EXPENSE_CATEGORIES[0] ?? 'Miscellaneous',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method: PAYMENT_METHODS[0].value,
  receipt: null,
});

function matchesDateRange(dateValue: string, from: string, to: string) {
  const time = new Date(dateValue).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function ExpensesPage() {
  const { user, displayName, isAdmin, isManager, effectiveBusinessOwnerId } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [drafts, setDrafts] = useState<ExpenseRowDraft[]>(() => [makeDraft()]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const canManage = isAdmin || isManager;

  const fetchExpenses = useCallback(async () => {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    setExpenses((data || []) as ExpenseRow[]);
  }, []);

  useEffect(() => {
    void fetchExpenses();
    const ch = supabase
      .channel('expenses-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        void fetchExpenses();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [fetchExpenses]);

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesDateRange(expense.expense_date, dateFrom, dateTo)),
    [expenses, dateFrom, dateTo],
  );

  const total = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const hasDateFilter = !!dateFrom || !!dateTo;

  const draftTotal = drafts.reduce((sum, row) => {
    const n = Number(row.amount || 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const resetDrafts = () => {
    setDrafts([makeDraft()]);
    setRowErrors({});
  };

  const updateDraft = (id: string, patch: Partial<ExpenseRowDraft>) => {
    setDrafts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleReceiptChange = (id: string, file: File | null) => {
    if (!file) {
      updateDraft(id, { receipt: null });
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Unsupported receipt file',
        description: 'Upload a JPG, PNG, WEBP, or PDF receipt.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Receipt too large',
        description: 'Keep receipt uploads under 5MB.',
        variant: 'destructive',
      });
      return;
    }
    updateDraft(id, { receipt: file });
  };

  const uploadReceipt = async (file: File) => {
    if (!businessId || !user) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${user.id}/${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { upsert: true });
    if (error) throw error;
    return { path, name: file.name };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId) return;

    // Pre-validate
    const errors: Record<string, string> = {};
    drafts.forEach((row, index) => {
      const amount = Number(row.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors[row.id] = `Row ${index + 1}: enter a valid amount.`;
      }
    });
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      toast({ title: 'Check the highlighted rows', description: Object.values(errors)[0], variant: 'destructive' });
      return;
    }

    setLoading(true);
    setRowErrors({});
    const failures: { index: number; message: string }[] = [];
    let successCount = 0;

    for (let i = 0; i < drafts.length; i += 1) {
      const row = drafts[i];
      try {
        let receipt: { path: string; name: string } | null = null;
        if (row.receipt) {
          try {
            receipt = await uploadReceipt(row.receipt);
          } catch (uploadError) {
            logSupabaseError('expenses.receipt_upload', uploadError, { businessId, userId: user.id });
          }
        }
        await insertExpenseRecord({
          user_id: effectiveBusinessOwnerId ?? user.id,
          business_id: businessId,
          category: row.category,
          description: row.description.trim(),
          amount: Number(row.amount || 0),
          expense_date: row.expense_date,
          payment_method: row.payment_method,
          attachment_path: receipt?.path ?? null,
          attachment_name: receipt?.name ?? null,
          recorded_by: user.id,
          recorded_by_name: displayName || user.email || 'Team member',
        });
        successCount += 1;
      } catch (error) {
        logSupabaseError('expenses.record', error, { businessId, userId: user.id, rowIndex: i });
        const message = getErrorMessage(error);
        failures.push({ index: i, message });
        setRowErrors((prev) => ({ ...prev, [row.id]: `Row ${i + 1}: ${message}` }));
      }
    }

    setLoading(false);

    if (failures.length === 0) {
      toast({
        title: successCount > 1 ? `${successCount} expenses recorded` : 'Expense recorded',
        description: 'Each entry now reduces available business money and profit.',
      });
      resetDrafts();
      setOpen(false);
      void fetchExpenses();
    } else {
      toast({
        title: `${failures.length} row${failures.length > 1 ? 's' : ''} failed`,
        description: `${successCount} saved. Fix the highlighted row${failures.length > 1 ? 's' : ''} and try again.`,
        variant: 'destructive',
      });
      // Keep only the failed drafts so user can retry
      const failedIds = new Set(failures.map((f) => drafts[f.index].id));
      setDrafts((current) => current.filter((row) => failedIds.has(row.id)));
      void fetchExpenses();
    }
  };

  const handleOpenReceipt = async (expense: ExpenseRow) => {
    if (!expense.attachment_path) return;
    setOpeningAttachmentId(expense.id);
    try {
      const { data, error } = await supabase.storage.from('expense-receipts').createSignedUrl(expense.attachment_path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({ title: 'Could not open receipt', description: error.message, variant: 'destructive' });
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const handleDelete = async (expense: ExpenseRow) => {
    if (!canManage) return;
    const confirmed = window.confirm('Delete this expense entry?');
    if (!confirmed) return;
    setDeletingId(expense.id);
    try {
      if (expense.attachment_path) {
        await supabase.storage.from('expense-receipts').remove([expense.attachment_path]);
      }
      const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
      if (error) throw error;
      toast({ title: 'Expense deleted' });
    } catch (error: any) {
      toast({ title: 'Could not delete expense', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout title="Expenses">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              Keep business expenses simple: category, amount, payment method, date, notes, and optional receipt.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="expenses-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                From
              </Label>
              <Input id="expenses-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="expenses-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                To
              </Label>
              <Input id="expenses-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-40" />
            </div>
            {hasDateFilter ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            ) : null}
            <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetDrafts(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Add Expense</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Expenses</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-4">
                    {drafts.map((row, index) => {
                      const error = rowErrors[row.id];
                      return (
                        <div key={row.id} className={`rounded-lg border p-4 space-y-3 ${error ? 'border-destructive/60 bg-destructive/5' : 'border-border bg-card'}`}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">Expense #{index + 1}</p>
                            {drafts.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-destructive"
                                onClick={() => setDrafts((current) => current.filter((r) => r.id !== row.id))}
                                disabled={loading}
                              >
                                <Trash2 className="mr-1 h-4 w-4" /> Remove
                              </Button>
                            ) : null}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Category</Label>
                              <Select value={row.category} onValueChange={(value) => updateDraft(row.id, { category: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {EXPENSE_CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Payment Method</Label>
                              <Select value={row.payment_method} onValueChange={(value) => updateDraft(row.id, { payment_method: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PAYMENT_METHODS.map((method) => (
                                    <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Amount (GH₵)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.amount}
                                onChange={(event) => updateDraft(row.id, { amount: event.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Date</Label>
                              <Input
                                type="date"
                                value={row.expense_date}
                                onChange={(event) => updateDraft(row.id, { expense_date: event.target.value })}
                              />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <Label>Description</Label>
                              <Textarea
                                value={row.description}
                                onChange={(event) => updateDraft(row.id, { description: event.target.value })}
                                placeholder="What was this expense for?"
                                rows={2}
                              />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <Label>Receipt (optional)</Label>
                              <Input
                                type="file"
                                accept=".jpg,.jpeg,.png,.webp,.pdf"
                                onChange={(event) => handleReceiptChange(row.id, event.target.files?.[0] ?? null)}
                              />
                              {row.receipt ? (
                                <p className="text-xs text-muted-foreground">Attached: {row.receipt.name}</p>
                              ) : null}
                            </div>
                          </div>
                          {error ? (
                            <p className="text-xs font-medium text-destructive">{error}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setDrafts((current) => [...current, makeDraft()])}
                    disabled={loading}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add another expense
                  </Button>

                  <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Total ({drafts.length} {drafts.length === 1 ? 'entry' : 'entries'})</span>
                    <span className="text-base font-semibold">{formatCurrency(draftTotal)}</span>
                  </div>

                  <Button type="submit" className="w-full bg-[#C7254E] hover:bg-[#A91D40] text-white" disabled={loading}>
                    {loading ? 'Saving...' : drafts.length > 1 ? `Save ${drafts.length} Expenses` : 'Record Expense'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expenses in Range</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{filteredExpenses.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Payment Methods</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <WalletCards className="h-9 w-9 text-primary" />
              <p className="text-sm text-muted-foreground">Cash, MoMo, bank transfer, and card are tracked per expense.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredExpenses.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Recorded By</TableHead>
                      {canManage ? <TableHead className="text-right">Action</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-xs">{new Date(expense.expense_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell className="max-w-[260px] whitespace-normal text-sm text-muted-foreground">
                          {expense.description || '—'}
                        </TableCell>
                        <TableCell>{PAYMENT_METHODS.find((method) => method.value === expense.payment_method)?.label ?? 'Cash'}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(expense.amount ?? 0))}</TableCell>
                        <TableCell>
                          {expense.attachment_path ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleOpenReceipt(expense)}
                              disabled={openingAttachmentId === expense.id}
                            >
                              <Paperclip className="mr-2 h-4 w-4" />
                              {openingAttachmentId === expense.id ? 'Opening...' : expense.attachment_name || 'Open'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No receipt</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{expense.recorded_by_name || '—'}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => void handleDelete(expense)}
                              disabled={deletingId === expense.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingId === expense.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Receipt className="h-7 w-7 text-muted-foreground" />}
                title={expenses.length > 0 ? 'No expenses in this date range' : 'No expenses recorded'}
                description={
                  expenses.length > 0
                    ? 'Clear or adjust the date filter to find older expenses.'
                    : 'Start recording everyday business expenses here.'
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
