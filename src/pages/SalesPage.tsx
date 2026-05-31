import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCurrency, PAYMENT_METHODS } from '@/lib/constants';
import { buildSaleDocumentSnapshot, normalizeSaleDocument, saleDocumentLabel, type SaleDocumentKind, type SaleDocumentRecord } from '@/lib/sale-documents';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, ShoppingCart, Trash2, Eye, Pencil, FileText, ReceiptText, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SaleDocumentViewerDialog } from '@/components/sales/SaleDocumentViewerDialog';
import { isNegativeStockSale } from '@/lib/sales-inventory';
import { validateSaleItemPayload, recomputeProductStock } from '@/lib/sale-items-schema';
import {
  deleteStockMovementsBySourceCompat,
  insertStockMovementCompat,
  insertSaleRecord,
  insertSaleItemRecord,
  loadProductsCompat,
  logSupabaseError,
  updateSaleRecord,
} from '@/lib/workspace';

type SaleLine = {
  key: string;
  product_id: string;
  quantity: string;
  discount: string;
  amount: string;
};

const newLine = (): SaleLine => ({
  key: Math.random().toString(36).slice(2),
  product_id: '',
  quantity: '',
  discount: '',
  amount: '',
});

export default function SalesPage() {
  const { user, displayName, isAdmin, isManager, effectiveBusinessOwnerId } = useAuth();
  const { businessId, business } = useBusiness();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState<SaleDocumentRecord | null>(null);
  const [documentBusyKey, setDocumentBusyKey] = useState<string | null>(null);

  // Edit state
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [pendingStockOverrideAction, setPendingStockOverrideAction] = useState<'new' | 'edit' | null>(null);

  const [lines, setLines] = useState<SaleLine[]>([newLine()]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // For edit: track original sale_items so we can compare stock deltas.
  const [editOriginalLines, setEditOriginalLines] = useState<Array<{ productId: string; quantity: number }>>([]);

  type ComputedLine = {
    line: SaleLine;
    product: any | null;
    qty: number;
    disc: number;
    defaultPrice: number;
    costPrice: number;
    amount: number;
    unitPrice: number;
  };

  const computeLine = (line: SaleLine): ComputedLine => {
    const product = allProducts.find((p) => p.id === line.product_id) || null;
    const qty = Number(line.quantity) || 0;
    const disc = Number(line.discount) || 0;
    const defaultPrice = Number(product?.selling_price) || 0;
    const costPrice = Number(product?.cost_price) || 0;
    const autoAmount = Math.max(0, qty * defaultPrice - disc);
    const amount = line.amount === '' ? autoAmount : Math.max(0, Number(line.amount) || 0);
    const unitPrice = qty > 0 ? (amount + disc) / qty : defaultPrice;
    return { line, product, qty, disc, defaultPrice, costPrice, amount, unitPrice };
  };

  const computed = useMemo(() => lines.map(computeLine), [lines, allProducts]);
  const subtotal = computed.reduce((s, c) => s + c.qty * c.defaultPrice, 0);
  const discount = computed.reduce((s, c) => s + c.disc, 0);
  const total = computed.reduce((s, c) => s + c.amount, 0);
  const costTotal = computed.reduce((s, c) => s + c.qty * c.costPrice, 0);
  const balance = Math.max(0, total - amountPaid);
  const profit = total - costTotal;
  const paymentStatus = balance <= 0 && total > 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  const validLines = computed.filter((c) => c.product && c.qty > 0);
  void isManager; // reserved for future per-row override permissions
  const allowSalesWithoutStock = Boolean(business?.allow_sales_without_stock);

  const updateLine = (key: string, patch: Partial<SaleLine>) => {
    setLines((curr) => curr.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((curr) => [...curr, newLine()]);
  const removeLine = (key: string) => {
    setLines((curr) => (curr.length <= 1 ? [newLine()] : curr.filter((l) => l.key !== key)));
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('sales-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchSales)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchAllProducts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [historyDateFrom, historyDateTo]);

  const fetchAllProducts = async () => {
    const data = await loadProductsCompat(false, businessId);
    setAllProducts(data || []);
    setProducts((data || []).filter((p: any) => Number(p.quantity ?? 0) > 0));
  };

  const fetchSales = async () => {
    const { data } = await supabase.from('sales').select('*').order('sale_date', { ascending: false }).limit(50);
    // Derive payment_status + balance for schemas that don't store them.
    const enriched = (data || []).map((s: any) => {
      const total = Number(s.total ?? 0);
      const paid = Number(s.amount_paid ?? 0);
      const balance = s.balance !== undefined && s.balance !== null ? Number(s.balance) : Math.max(0, total - paid);
      const payment_status = s.payment_status || (balance <= 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
      return { ...s, balance, payment_status };
    });
    setSales(enriched);
  };

  const fetchSaleItems = async (saleId: string) => {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', saleId);
    setSaleItems(prev => ({ ...prev, [saleId]: data || [] }));
    return data || [];
  };

  const fetchData = async () => {
    await Promise.all([fetchAllProducts(), fetchSales()]);
  };

  // Stock is managed entirely by the DB triggers `adjust_stock_on_sale_item`
  // (decrements products.stock on sale_items insert/delete) and
  // `log_stock_movement_on_sale_item` (writes the corresponding stock_movements
  // row). The app must NOT write to products.quantity / products.stock or to
  // stock_movements directly — the schema doesn't have a `quantity` column on
  // products and the triggers will double-count if we do.
  const updateProductQuantity = async (_productId: string, _nextQuantity: number) => {
    // no-op: handled by adjust_stock_on_sale_item trigger
  };

  const restoreSaleStock = async (_items: any[]) => {
    // no-op: deleting sale_items rows fires adjust_stock_on_sale_item which
    // restores products.stock automatically.
  };

  const applyEditStockAdjustments = async (_args: {
    oldProductId: string;
    oldQty: number;
    newProduct: any;
    newQty: number;
  }) => {
    // no-op: removing the old sale_items row + inserting the new one fires the
    // adjust_stock_on_sale_item trigger, which handles all stock deltas.
  };

  const resetForm = useCallback(() => {
    setLines([newLine()]);
    setPaymentMethod('cash');
    setAmountPaid(0);
    setCustomerName('');
    setCustomerPhone('');
    setSaleDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setSaleNotes('');
    setEditSaleId(null);
    setEditOriginalLines([]);
  }, []);

  useEffect(() => {
    if (searchParams.get('newSale') !== '1') return;

    resetForm();
    setOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('newSale');
      return next;
    }, { replace: true });
  }, [resetForm, searchParams, setSearchParams]);

  const createSaleMovement = async (_args: {
    saleItemId: string;
    product: any;
    soldQuantity: number;
    unitCost: number;
    soldPrice: number;
    note: string;
    isNegativeStockSale?: boolean;
  }) => {
    // no-op: log_stock_movement_on_sale_item DB trigger writes the
    // stock_movements row automatically when the sale_items row is inserted.
  };

  // Open edit dialog — load all sale_items as line rows.
  const handleOpenEdit = async (sale: any) => {
    const items = await fetchSaleItems(sale.id);
    if (!items.length) {
      toast({ title: 'Cannot load sale items', variant: 'destructive' });
      return;
    }

    setEditSaleId(sale.id);
    setLines(
      items.map((item: any) => ({
        key: Math.random().toString(36).slice(2),
        product_id: item.product_id || '',
        quantity: String(item.quantity ?? ''),
        discount: '', // historical sale_items don't carry per-line discount
        amount: String(Number(item.line_total ?? item.total ?? 0)),
      })),
    );
    setEditOriginalLines(
      items.map((item: any) => ({
        productId: item.product_id || '',
        quantity: Number(item.quantity) || 0,
      })),
    );
    setPaymentMethod(sale.payment_method);
    setAmountPaid(Number(sale.amount_paid));
    setCustomerName(sale.customer_name || '');
    setCustomerPhone(sale.customer_phone || '');
    setSaleDate(new Date(sale.sale_date).toISOString().slice(0, 10));
    setDueDate(sale.due_date ? new Date(sale.due_date).toISOString().slice(0, 10) : '');
    setSaleNotes(sale.notes || '');
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (validLines.length === 0) {
      toast({ title: 'Add at least one product', description: 'Pick a product and enter a quantity.', variant: 'destructive' });
      return;
    }
    if (editSaleId) {
      await handleSaveEdit();
    } else {
      await handleNewSale();
    }
  };

  // Aggregate requested quantity per product (in case the same product
  // appears on multiple rows) and compare to available stock.
  const computeStockShortfall = (
    rows: ComputedLine[],
    offsets: Record<string, number> = {},
  ) => {
    const requested = new Map<string, number>();
    for (const r of rows) {
      if (!r.product) continue;
      requested.set(r.product.id, (requested.get(r.product.id) ?? 0) + r.qty);
    }
    let total = 0;
    for (const [productId, qty] of requested) {
      const prod = allProducts.find((p) => p.id === productId);
      const available = Number(prod?.quantity ?? 0) + (offsets[productId] ?? 0);
      total += Math.max(0, qty - Math.max(0, available));
    }
    return total;
  };

  const handleNewSale = async (overrideStockCheck = false) => {
    if (!user || !businessId) return;
    const stockShortfall = computeStockShortfall(validLines);

    if (stockShortfall > 0 && !allowSalesWithoutStock) {
      toast({
        title: 'Out of stock',
        description: 'One or more items are out of stock. Please restock before selling.',
        variant: 'destructive',
      });
      return;
    }
    if (stockShortfall > 0 && allowSalesWithoutStock && !overrideStockCheck) {
      setPendingStockOverrideAction('new');
      return;
    }

    setLoading(true);
    try {
      const sale = await insertSaleRecord({
        user_id: effectiveBusinessOwnerId ?? user.id,
        business_id: businessId,
        sale_date: new Date(saleDate).toISOString(),
        customer_name: customerName || 'Walk-in',
        customer_phone: customerPhone,
        staff_id: user.id,
        staff_name: displayName,
        subtotal, discount, total,
        amount_paid: amountPaid, balance,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        due_date: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        status: 'completed',
        sale_channel: 'pos',
        stock_status: stockShortfall > 0 ? 'negative_stock_sale' : 'in_stock',
        stock_shortfall: stockShortfall,
        notes: saleNotes,
        cost_total: costTotal,
      });

      for (const row of validLines) {
        const payload = {
          user_id: effectiveBusinessOwnerId ?? user.id,
          business_id: businessId,
          sale_id: sale.id,
          product_id: row.product!.id,
          product_name: row.product!.name,
          sku: row.product!.sku,
          quantity: row.qty,
          unit_price: row.unitPrice,
          unit_cost: row.costPrice,
          cost_price: row.costPrice,
          line_total: row.amount,
          default_price: row.defaultPrice,
        };
        const validation = validateSaleItemPayload(payload);
        if (validation.ok === false) {
          toast({ title: 'Invalid sale item', description: validation.message, variant: 'destructive' });
          continue;
        }
        await insertSaleItemRecord(payload);
      }

      if (customerName && customerName !== 'Walk-in') {
        const { data: existing } = await supabase.from('customers').select('id').eq('name', customerName).maybeSingle();
        if (!existing) {
          await supabase.from('customers').insert({ name: customerName, phone: customerPhone, business_id: businessId });
        }
      }

      const summary = validLines
        .map((r) => `${r.product!.name} × ${r.qty}`)
        .join(', ');
      toast({ title: 'Sale recorded!', description: `${summary} — ${formatCurrency(total)}` });
      setPendingStockOverrideAction(null);
      resetForm();
      setOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (overrideStockCheck = false) => {
    if (!user || !editSaleId) return;
    setEditLoading(true);
    try {
      // Credit back the original quantities so the stock check reflects what's
      // free after removing the prior version of this sale.
      const offsets: Record<string, number> = {};
      for (const orig of editOriginalLines) {
        if (!orig.productId) continue;
        offsets[orig.productId] = (offsets[orig.productId] ?? 0) + orig.quantity;
      }
      const stockShortfall = computeStockShortfall(validLines, offsets);

      if (stockShortfall > 0 && !allowSalesWithoutStock) {
        toast({ title: 'Out of stock', description: 'One or more items are out of stock.', variant: 'destructive' });
        setEditLoading(false);
        return;
      }
      if (stockShortfall > 0 && allowSalesWithoutStock && !overrideStockCheck) {
        setPendingStockOverrideAction('edit');
        setEditLoading(false);
        return;
      }

      const existingItems = saleItems[editSaleId] || [];
      const oldSale = sales.find((s) => s.id === editSaleId);
      const prevValues = oldSale
        ? `Items: ${existingItems.map((i: any) => `${i.product_name}×${i.quantity}`).join(', ')}, Total: ${oldSale.total}`
        : '';

      const priorIds = existingItems.map((item: any) => item.id).filter(Boolean);
      if (priorIds.length > 0) {
        await deleteStockMovementsBySourceCompat(priorIds);
      }
      await supabase.from('sale_items').delete().eq('sale_id', editSaleId);

      await updateSaleRecord(editSaleId, {
        sale_date: new Date(saleDate).toISOString(),
        customer_name: customerName || 'Walk-in',
        customer_phone: customerPhone,
        subtotal, discount, total,
        amount_paid: amountPaid, balance,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        due_date: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        status: 'completed',
        sale_channel: 'pos',
        stock_status: stockShortfall > 0 ? 'negative_stock_sale' : 'in_stock',
        stock_shortfall: stockShortfall,
        notes: saleNotes,
        cost_total: costTotal,
      });

      for (const row of validLines) {
        const payload = {
          user_id: effectiveBusinessOwnerId ?? user.id,
          business_id: businessId!,
          sale_id: editSaleId,
          product_id: row.product!.id,
          product_name: row.product!.name,
          sku: row.product!.sku,
          quantity: row.qty,
          unit_price: row.unitPrice,
          unit_cost: row.costPrice,
          cost_price: row.costPrice,
          line_total: row.amount,
          default_price: row.defaultPrice,
        };
        const v = validateSaleItemPayload(payload);
        if (v.ok === false) {
          toast({ title: 'Invalid sale item', description: v.message, variant: 'destructive' });
          continue;
        }
        await insertSaleItemRecord(payload);
      }

      const newValues = `Items: ${validLines.map((r) => `${r.product!.name}×${r.qty}`).join(', ')}, Total: ${total}`;
      await supabase.from('audit_log').insert({
        action: 'sale_edited',
        details: `Previous: [${prevValues}] → New: [${newValues}]`,
        performed_by: user.id,
        performed_by_name: displayName || user.email || '',
      });

      toast({ title: 'Sales transaction updated successfully' });
      setPendingStockOverrideAction(null);
      resetForm();
      setOpen(false);
      setSaleItems((prev) => { const next = { ...prev }; delete next[editSaleId]; return next; });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error updating sale', description: err.message, variant: 'destructive' });
    } finally {
      setEditLoading(false);
    }
  };


  const handleDeleteSale = async (saleId: string) => {
    setDeleting(true);
    try {
      const existingItems = saleItems[saleId] || await fetchSaleItems(saleId);
      const sourceIds = existingItems.map((item: any) => item.id).filter(Boolean);
      if (sourceIds.length > 0) {
        await deleteStockMovementsBySourceCompat(sourceIds);
      }
      await restoreSaleStock(existingItems);
      await supabase.from('sale_items').delete().eq('sale_id', saleId);
      await supabase.from('sales').delete().eq('id', saleId);
      toast({ title: 'Sale deleted successfully', description: 'Stock has been restored automatically.' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error deleting sale', description: err.message, variant: 'destructive' });
    } finally { setDeleting(false); setDeleteId(null); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      for (const saleId of selectedIds) {
        const existingItems = saleItems[saleId] || await fetchSaleItems(saleId);
        const sourceIds = existingItems.map((item: any) => item.id).filter(Boolean);
        if (sourceIds.length > 0) {
          await deleteStockMovementsBySourceCompat(sourceIds);
        }
        await restoreSaleStock(existingItems);
        await supabase.from('sale_items').delete().eq('sale_id', saleId);
        await supabase.from('sales').delete().eq('id', saleId);
      }
      toast({ title: `${selectedIds.size} sale(s) deleted`, description: 'Stock has been restored for all deleted sales.' });
      setSelectedIds(new Set()); fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setDeleting(false); setBulkDeleteOpen(false); }
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (historyDateFrom && new Date(sale.sale_date) < new Date(`${historyDateFrom}T00:00:00`)) return false;
      if (historyDateTo && new Date(sale.sale_date) > new Date(`${historyDateTo}T23:59:59`)) return false;
      return true;
    });
  }, [sales, historyDateFrom, historyDateTo]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filteredSales.length ? new Set() : new Set(filteredSales.map(s => s.id)));
  };

  const detailSale = sales.find(s => s.id === detailSaleId);
  const detailItems = detailSaleId ? saleItems[detailSaleId] || [] : [];
  // For the form, show all products when editing (including 0-stock), only in-stock for new
  const formProducts = editSaleId ? allProducts : (allowSalesWithoutStock ? allProducts : products);

  const openDocument = (document: SaleDocumentRecord) => {
    setActiveDocument(document);
    setDocumentOpen(true);
  };

  const generateDocument = async (sale: any, kind: SaleDocumentKind) => {
    if (!user || !businessId || !business) return;
    if (kind === 'receipt' && sale.payment_status !== 'paid') {
      toast({
        title: 'Receipt unavailable',
        description: 'Receipts can only be issued for paid sales.',
        variant: 'destructive',
      });
      return;
    }

    const busyKey = `${sale.id}:${kind}`;
    setDocumentBusyKey(busyKey);
    try {
      const items = saleItems[sale.id] ?? await fetchSaleItems(sale.id);
      const snapshot = buildSaleDocumentSnapshot({
        business,
        sale,
        items,
        issuedBy: {
          name: displayName || sale.staff_name || user.email || 'KudiTrack User',
          email: user.email,
        },
      });

      const { data, error } = await supabase
        .from('sale_documents' as any)
        .upsert({
          user_id: effectiveBusinessOwnerId ?? user.id,
          sale_id: sale.id,
          kind,
          sale_date: sale.sale_date,
          payment_status: sale.payment_status,
          amount_ghs: Number(sale.total ?? 0),
          amount_paid_ghs: Number(sale.amount_paid ?? 0),
          balance_ghs: Number(sale.balance ?? (Number(sale.total ?? 0) - Number(sale.amount_paid ?? 0))),
          customer_name: sale.customer_name || 'Walk-in',
          customer_phone: sale.customer_phone || '',
          seller_name: sale.staff_name || displayName || user.email || '',
          issued_by: user.id,
          snapshot,
        }, { onConflict: 'sale_id,kind' })
        .select('*')
        .single();

      if (error) throw error;

      const document = normalizeSaleDocument(data);
      setActiveDocument(document);
      setDocumentOpen(true);
      toast({
        title: `${saleDocumentLabel(kind)} ready`,
        description: `${document.document_number} is ready to view, print, or download.`,
      });
    } catch (error: any) {
      toast({
        title: `Could not create ${saleDocumentLabel(kind).toLowerCase()}`,
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDocumentBusyKey(null);
    }
  };

  return (
    <AppLayout title="Sales Entry">
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Record new sales and view transaction history</p>
          <div className="flex gap-2">
            {isAdmin && selectedIds.size > 0 && (
              <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> New Sale</Button>
          </div>
        </div>

        {/* New/Edit Sale Dialog */}
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editSaleId ? 'Edit Sale' : 'Record Sale'}</DialogTitle>
              {editSaleId && <Badge variant="outline" className="w-fit text-[10px]">Editing Transaction</Badge>}
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Product line items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Products</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
                  </Button>
                </div>
                {computed.map((row, idx) => {
                  const stockLabel = row.product ? `${Number(row.product.quantity ?? 0)} in stock` : '';
                  const autoAmount = row.qty > 0 ? row.qty * row.defaultPrice - row.disc : 0;
                  return (
                    <div key={row.line.key} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Item {idx + 1}</span>
                        {lines.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(row.line.key)} aria-label="Remove item">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Product</Label>
                        <Select value={row.line.product_id} onValueChange={(v) => updateLine(row.line.key, { product_id: v, amount: '' })}>
                          <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {formProducts.length === 0 && (
                              <div className="p-3 text-sm text-muted-foreground text-center">No products available.</div>
                            )}
                            {formProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {formatCurrency(Number(p.selling_price))} ({Number(p.quantity ?? 0)} in stock)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {row.product && (
                          <p className="mt-1 text-[10px] text-muted-foreground">Default price: {formatCurrency(row.defaultPrice)} · {stockLabel}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            inputMode="numeric"
                            placeholder="0"
                            value={row.line.quantity}
                            onChange={(e) => updateLine(row.line.key, { quantity: e.target.value, amount: '' })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Discount</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={row.line.discount}
                            onChange={(e) => updateLine(row.line.key, { discount: e.target.value, amount: '' })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            placeholder={autoAmount > 0 ? autoAmount.toFixed(2) : '0.00'}
                            value={row.line.amount}
                            onChange={(e) => updateLine(row.line.key, { amount: e.target.value })}
                          />
                        </div>
                      </div>
                      {row.product && row.qty > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Unit price: {formatCurrency(row.unitPrice)}</span>
                          <span className="font-semibold text-foreground">{formatCurrency(row.amount)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><Label>Amount Paid (GH₵)</Label><Input type="number" min={0} value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} /></div>
                <div><Label>Sale Date</Label><Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
              </div>

              {paymentStatus !== 'paid' && (
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><Label>Customer Name <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in" /></div>
                <div><Label>Phone <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
              </div>

              <div>
                <Label>Transaction Note <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                <Input value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Optional note" />
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-2 mt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>
                  <div className="flex justify-between"><span>Balance Due</span><span className="text-destructive font-semibold">{formatCurrency(balance)}</span></div>
                  <div className="flex justify-between"><span>Profit</span><span className={profit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(profit)}</span></div>
                </CardContent>
              </Card>

              <Button type="submit" className="w-full" disabled={loading || editLoading || validLines.length === 0}>
                {editLoading ? 'Saving Changes...' : loading ? 'Saving...' : editSaleId ? 'Save Changes' : 'Record Sale'}
              </Button>
              {editSaleId && (
                <Button type="button" variant="outline" className="w-full" onClick={() => { resetForm(); setOpen(false); }}>
                  Cancel
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={pendingStockOverrideAction !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingStockOverrideAction(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Continue sale?</AlertDialogTitle>
              <AlertDialogDescription>
                This product is out of stock. Continue anyway?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingStockOverrideAction(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const action = pendingStockOverrideAction;
                  setPendingStockOverrideAction(null);
                  if (action === 'new') {
                    void handleNewSale(true);
                  } else if (action === 'edit') {
                    void handleSaveEdit(true);
                  }
                }}
              >
                Continue Sale
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sale Detail Dialog */}
        <Dialog open={!!detailSaleId} onOpenChange={o => { if (!o) setDetailSaleId(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Sale Details</DialogTitle></DialogHeader>
            {detailSale && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Date:</span> {new Date(detailSale.sale_date).toLocaleDateString()}</div>
                  <div><span className="text-muted-foreground">Customer:</span> {detailSale.customer_name || 'Walk-in'}</div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(Number(detailSale.total))}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <StatusBadge status={detailSale.payment_status} />
                    {isNegativeStockSale(detailSale) ? (
                      <Badge variant="destructive">Negative Stock Sale</Badge>
                    ) : null}
                  </div>
                  {detailSale.notes && <div className="col-span-2"><span className="text-muted-foreground">Note:</span> {detailSale.notes}</div>}
                </div>
                {detailItems.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead>Sold At</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailItems.map((item: any) => {
                        const wasOverridden = Number(item.default_price) > 0 && Number(item.unit_price) !== Number(item.default_price);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-xs">{item.product_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{Number(item.default_price) > 0 ? formatCurrency(Number(item.default_price)) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              {formatCurrency(Number(item.unit_price))}
                              {wasOverridden && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-primary/50 text-primary">Custom</Badge>}
                            </TableCell>
                            <TableCell className="text-xs">{item.quantity}</TableCell>
                            <TableCell className="text-xs font-semibold">{formatCurrency(Number(item.line_total))}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{item.price_note || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading items...</p>
                )}

              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Dialogs */}
        <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sale</AlertDialogTitle>
              <AlertDialogDescription>Are you sure? Stock will be restored automatically.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && handleDeleteSale(deleteId)} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Deleting...' : 'Delete Sale'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} Sale(s)</AlertDialogTitle>
              <AlertDialogDescription>Are you sure? Stock will be restored for all deleted items.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Sale(s)`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sales History */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle className="text-base">Sales History</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="sales-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                <Input id="sales-from" type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} className="w-40" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sales-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                <Input id="sales-to" type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} className="w-40" />
              </div>
              {(historyDateFrom || historyDateTo) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setHistoryDateFrom(''); setHistoryDateTo(''); }}>
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {filteredSales.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-10">
                          <Checkbox checked={selectedIds.size === filteredSales.length && filteredSales.length > 0} onCheckedChange={toggleSelectAll} />
                        </TableHead>
                      )}
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(sale => (
                      <TableRow key={sale.id}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox checked={selectedIds.has(sale.id)} onCheckedChange={() => toggleSelect(sale.id)} />
                          </TableCell>
                        )}
                        <TableCell className="text-xs">{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                        <TableCell>{sale.customer_name || 'Walk-in'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sale.staff_name || '—'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(sale.total))}</TableCell>
                        <TableCell>{formatCurrency(Number(sale.amount_paid))}</TableCell>
                        <TableCell className={Number(sale.balance) > 0 ? 'text-destructive font-semibold' : ''}>{formatCurrency(Number(sale.balance))}</TableCell>
                        <TableCell className="capitalize text-xs">{sale.payment_method?.replace('_', ' ')}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={sale.payment_status} />
                            {isNegativeStockSale(sale) ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Negative Stock Sale
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => { setDetailSaleId(sale.id); fetchSaleItems(sale.id); }} title="View details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void generateDocument(sale, 'invoice')}
                                    disabled={documentBusyKey === `${sale.id}:invoice`}
                                    title="Generate invoice"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Generate or open invoice</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void generateDocument(sale, 'receipt')}
                                      disabled={sale.payment_status !== 'paid' || documentBusyKey === `${sale.id}:receipt`}
                                      title={sale.payment_status === 'paid' ? 'Generate receipt' : 'Receipts need a paid sale'}
                                    >
                                      <ReceiptText className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {sale.payment_status === 'paid' ? 'Generate or open receipt' : 'Receipt becomes available when the sale is fully paid'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sale)} title="Edit sale">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteId(sale.id)} title="Delete sale">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<ShoppingCart className="h-7 w-7 text-muted-foreground" />} title={sales.length > 0 ? 'No sales in this date range' : 'No sales yet'} description={sales.length > 0 ? 'Clear or adjust the date filter to find older transactions.' : "Click 'New Sale' to record your first transaction."} />
            )}
          </CardContent>
        </Card>

      </div>

      <SaleDocumentViewerDialog open={documentOpen} onOpenChange={setDocumentOpen} document={activeDocument} />
    </AppLayout>
  );
}
