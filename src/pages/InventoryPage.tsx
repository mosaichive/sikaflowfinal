import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, PAYMENT_METHODS, SIKAFLOW_TOOLTIPS, STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import { toNumber } from '@/lib/sales-inventory';
import { AVAILABLE_BUSINESS_MONEY_FORMULA } from '@/lib/business-money';
import { AlertTriangle, Boxes, History, PackageMinus, PackagePlus, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { recomputeProductStock } from '@/lib/sale-items-schema';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  calculateDamagedGoodsSummary,
  DAMAGE_REASONS,
  groupDamagedGoodsByProduct,
  getDamagedGoodsValue,
  isMissingDamagedGoodsSchemaError,
  type DamageReason,
} from '@/lib/damaged-goods';
import {
  insertRestockRecord,
  insertStockMovementCompat,
  loadProductsCompat,
  loadStockMovementsCompat,
  logSupabaseError,
  updateRestockRecord,
} from '@/lib/workspace';

type ProductRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number | string;
  selling_price: number | string;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  supplier?: string | null;
};

type StockMovementRow = {
  id: string;
  product_id: string | null;
  movement_type: string;
  quantity_change: number;
  quantity_after: number;
  unit_cost: number | string;
  unit_price: number | string;
  note: string;
  created_by_name?: string | null;
  movement_date: string;
};

type RestockRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  category: string;
  quantity_added: number;
  cost_price_per_unit: number | string;
  total_cost: number | string;
  payment_method: string;
  note: string | null;
  reference: string | null;
  recorded_by_name: string | null;
  restock_date: string;
  status: string;
};

type DamagedGoodsRow = {
  id: string;
  business_id: string;
  user_id: string;
  product_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  quantity_after: number;
  reason: DamageReason | string;
  damage_date: string;
  notes: string | null;
  unit_cost: number | string;
  total_value: number | string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
};

type InventoryHistoryRow = {
  id: string;
  entryType: 'opening_stock' | 'restock';
  date: string;
  productName: string;
  category: string;
  quantityAdded: number;
  costPerUnit: number;
  totalCost: number;
  paymentMethod: string | null;
  deductionStatus: string;
  noteReference: string | null;
  createdByName: string | null;
  editableRestock: RestockRow | null;
};

type ExpenseRow = Record<string, any>;

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error || fallback;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as any).message;
    return typeof m === 'string' && m ? m : fallback;
  }
  return fallback;
}

function extractRestockExpenseId(description: string | null | undefined) {
  const match = String(description ?? '').match(/\[RESTOCK:([a-f0-9-]+)\]/i);
  return match?.[1] ?? null;
}

function inDateFilter(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (from && timestamp < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && timestamp > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function InventoryPage() {
  const { user, displayName, isAdmin, isManager, effectiveBusinessOwnerId, hasModule } = useAuth();
  const { businessId } = useBusiness();
  const { financials, loading: financialsLoading } = useBusinessFinancials();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [restocks, setRestocks] = useState<RestockRow[]>([]);
  const [damagedGoods, setDamagedGoods] = useState<DamagedGoodsRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [damageDialogOpen, setDamageDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [damageSaving, setDamageSaving] = useState(false);
  const [editingRestock, setEditingRestock] = useState<RestockRow | null>(null);
  const [deletingRestockId, setDeletingRestockId] = useState<string | null>(null);
  const [form, setForm] = useState({
    product_id: '',
    movement_date: new Date().toISOString().slice(0, 10),
    quantity: '1',
    unit_cost: '0',
    selling_price: '0',
    payment_method: PAYMENT_METHODS[0].value as string,
    description: '',
    is_opening_stock: false,
  });
  const [damageForm, setDamageForm] = useState({
    product_id: '',
    quantity: '1',
    reason: '',
    damage_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [damageProductFilter, setDamageProductFilter] = useState('all');
  const [damageReasonFilter, setDamageReasonFilter] = useState('all');
  const [damageDateFrom, setDamageDateFrom] = useState('');
  const [damageDateTo, setDamageDateTo] = useState('');

  const canManage = isAdmin || isManager;
  const canRecordDamage = hasModule('damaged_goods');
  const [recomputing, setRecomputing] = useState(false);
  const userId = user?.id ?? null;
  const ownerUserId = effectiveBusinessOwnerId ?? userId;

  const load = useCallback(async () => {
    const [productsRes, movementsRes, restocksRes, damagedRes, expensesRes] = await Promise.allSettled([
      loadProductsCompat(false, businessId),
      loadStockMovementsCompat(100, businessId),
      ownerUserId
        ? supabase.from('restocks').select('*').eq('user_id', ownerUserId).order('restock_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ownerUserId
        ? supabase.from('damaged_goods' as any).select('*').eq('user_id', ownerUserId).order('damage_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ownerUserId
        ? supabase.from('expenses').select('*').eq('user_id', ownerUserId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsRes.status === 'fulfilled') {
      setProducts(productsRes.value as ProductRow[]);
    } else {
      logSupabaseError('inventory.load.products', productsRes.reason);
      setProducts([]);
    }

    if (movementsRes.status === 'fulfilled') {
      setMovements(movementsRes.value as StockMovementRow[]);
    } else {
      logSupabaseError('inventory.load.movements', movementsRes.reason);
      setMovements([]);
    }

    if (restocksRes.status === 'fulfilled') {
      setRestocks((restocksRes.value.error ? [] : ((restocksRes.value.data || []) as RestockRow[])) ?? []);
    } else {
      logSupabaseError('inventory.load.restocks', restocksRes.reason);
      setRestocks([]);
    }

    if (damagedRes.status === 'fulfilled') {
      setDamagedGoods((damagedRes.value.error ? [] : ((damagedRes.value.data || []) as DamagedGoodsRow[])) ?? []);
      if (damagedRes.value.error && !isMissingDamagedGoodsSchemaError(damagedRes.value.error)) {
        logSupabaseError('inventory.load.damagedGoods', damagedRes.value.error, { businessId, ownerUserId });
      }
    } else {
      logSupabaseError('inventory.load.damagedGoods', damagedRes.reason);
      setDamagedGoods([]);
    }

    if (expensesRes.status === 'fulfilled') {
      setExpenses((expensesRes.value.error ? [] : ((expensesRes.value.data || []) as ExpenseRow[])) ?? []);
    } else {
      logSupabaseError('inventory.load.expenses', expensesRes.reason);
      setExpenses([]);
    }
  }, [businessId, ownerUserId]);

  const handleRecomputeStock = useCallback(async () => {
    setRecomputing(true);
    try {
      const result = await recomputeProductStock();
      if (!result.ok) {
        toast({
          title: 'Could not recalculate stock',
          description: result.error ?? 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Stock recalculated',
        description: `${result.updated.length} product(s) updated from stock movements.`,
      });
      await load();
    } finally {
      setRecomputing(false);
    }
  }, [toast, load]);

  useEffect(() => {
    void load();
    if (!ownerUserId) return;
    const channel = supabase
      .channel('inventory-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `user_id=eq.${ownerUserId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `user_id=eq.${ownerUserId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks', filter: `user_id=eq.${ownerUserId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'damaged_goods', filter: `user_id=eq.${ownerUserId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${ownerUserId}` }, () => { void load(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, ownerUserId]);

  const selectedProduct = products.find((product) => product.id === form.product_id) || null;
  const selectedDamageProduct = products.find((product) => product.id === damageForm.product_id) || null;
  const inventoryProducts = useMemo(
    () => [...products].sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );
  const lowStockProducts = useMemo(
    () =>
      products.filter((product) => {
        const quantity = toNumber(product.quantity);
        const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);
        return quantity > 0 && quantity <= threshold;
      }),
    [products],
  );
  const totalRestockCost = useMemo(
    () => Math.max(0, Number(form.quantity || 0)) * Math.max(0, Number(form.unit_cost || 0)),
    [form.quantity, form.unit_cost],
  );
  const restockStockValueCost = useMemo(
    () => Math.max(0, Number(form.quantity || 0)) * Math.max(0, Number(form.unit_cost || 0)),
    [form.quantity, form.unit_cost],
  );
  const damagePreviewValue = useMemo(
    () => Math.max(0, Number(damageForm.quantity || 0)) * Math.max(0, toNumber(selectedDamageProduct?.cost_price ?? 0)),
    [damageForm.quantity, selectedDamageProduct],
  );
  const filteredDamagedGoods = useMemo(
    () =>
      damagedGoods.filter((entry) => {
        if (damageProductFilter !== 'all' && entry.product_id !== damageProductFilter) return false;
        if (damageReasonFilter !== 'all' && entry.reason !== damageReasonFilter) return false;
        if ((damageDateFrom || damageDateTo) && !inDateFilter(entry.damage_date, damageDateFrom, damageDateTo)) return false;
        return true;
      }),
    [damageDateFrom, damageDateTo, damageProductFilter, damageReasonFilter, damagedGoods],
  );
  const damagedGoodsSummary = useMemo(
    () => calculateDamagedGoodsSummary(filteredDamagedGoods),
    [filteredDamagedGoods],
  );
  const damagedGoodsByProduct = useMemo(
    () => groupDamagedGoodsByProduct(filteredDamagedGoods),
    [filteredDamagedGoods],
  );
  const movementTypeLabels = useMemo(
    () =>
      new Map([
        ...STOCK_MOVEMENT_TYPES.map((type) => [type.value, type.label] as const),
        ['sold', 'Sale'] as const,
        ['damaged_stock', 'Damaged Goods'] as const,
      ]),
    [],
  );
  const stockMovementHistory = useMemo(
    () =>
      [...movements]
        .sort((left, right) => new Date(right.movement_date).getTime() - new Date(left.movement_date).getTime())
        .slice(0, 50),
    [movements],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setForm((current) => ({
      ...current,
      unit_cost:
        current.product_id === selectedProduct.id && current.unit_cost !== '0'
          ? current.unit_cost
          : String(Number(selectedProduct.cost_price || 0)),
      selling_price:
        current.product_id === selectedProduct.id && current.selling_price !== '0'
          ? current.selling_price
          : String(Number(selectedProduct.selling_price || 0)),
    }));
  }, [selectedProduct]);

  const restockExpenseByRestockId = useMemo(() => {
    const next = new Map<string, string>();
    for (const expense of expenses) {
      const restockId = extractRestockExpenseId(expense.description);
      if (restockId) {
        next.set(restockId, expense.id);
      }
    }
    return next;
  }, [expenses]);

  const inventoryHistory = useMemo<InventoryHistoryRow[]>(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    const openingStockRows = movements
      .filter((movement) => movement.movement_type === 'opening_stock')
      .map((movement) => {
        const product = movement.product_id ? productMap.get(movement.product_id) : undefined;
        const quantityAdded = Math.max(0, toNumber(movement.quantity_change));
        const costPerUnit = toNumber(movement.unit_cost ?? product?.cost_price ?? 0);
        return {
          id: `opening-${movement.id}`,
          entryType: 'opening_stock' as const,
          date: movement.movement_date,
          productName: product?.name || 'Opening Stock',
          category: product?.category || '—',
          quantityAdded,
          costPerUnit,
          totalCost: quantityAdded * costPerUnit,
          paymentMethod: null,
          deductionStatus: 'Not deducted',
          noteReference: movement.note || 'Opening Stock',
          createdByName: movement.created_by_name || null,
          editableRestock: null,
        };
      });

    const restockRows = restocks.map((restock) => {
      const isOpening = Boolean((restock as any).is_opening_stock);
      return {
        id: restock.id,
        entryType: (isOpening ? 'opening_stock' : 'restock') as 'opening_stock' | 'restock',
        date: restock.restock_date,
        productName: restock.product_name,
        category: restock.category || '—',
        quantityAdded: toNumber(restock.quantity_added),
        costPerUnit: toNumber(restock.cost_price_per_unit),
        totalCost: toNumber(restock.total_cost),
        paymentMethod: restock.payment_method || null,
        deductionStatus: isOpening ? 'Not deducted' : 'Deducted from Available Money',
        noteReference: restock.note || restock.reference || null,
        createdByName: restock.recorded_by_name || null,
        editableRestock: restock,
      };
    });


    return [...restockRows, ...openingStockRows].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
  }, [movements, products, restocks]);

  const getStockStatus = useCallback((product: ProductRow) => {
    const quantity = toNumber(product.quantity);
    const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);

    if (quantity < 0) {
      return {
        label: 'Negative Stock',
        className: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
      };
    }

    if (quantity === 0) {
      return {
        label: 'Out of Stock',
        className: 'border border-rose-500/30 bg-rose-500/10 text-rose-300',
      };
    }

    if (threshold > 0 && quantity <= threshold) {
      return {
        label: 'Low Stock',
        className: 'border border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
      };
    }

    return {
      label: 'In Stock',
      className: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    };
  }, []);

  const resetForm = () => {
    setForm({
      product_id: '',
      movement_date: new Date().toISOString().slice(0, 10),
      quantity: '1',
      unit_cost: '0',
      selling_price: '0',
      payment_method: PAYMENT_METHODS[0].value,
      description: '',
      is_opening_stock: false,
    });
    setEditingRestock(null);
  };

  const openCreateRestock = () => {
    resetForm();
    setDialogOpen(true);
  };

  const resetDamageForm = () => {
    setDamageForm({
      product_id: '',
      quantity: '1',
      reason: '',
      damage_date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
  };

  const openRecordDamage = () => {
    resetDamageForm();
    setDamageDialogOpen(true);
  };

  const openEditRestock = (restock: RestockRow) => {
    const product = products.find((row) => row.id === restock.product_id);
    setEditingRestock(restock);
    setForm({
      product_id: restock.product_id || '',
      movement_date: new Date(restock.restock_date).toISOString().slice(0, 10),
      quantity: String(restock.quantity_added),
      unit_cost: String(Number(restock.cost_price_per_unit || 0)),
      selling_price: String(Number(product?.selling_price || 0)),
      payment_method: (restock.payment_method || PAYMENT_METHODS[0].value) as typeof PAYMENT_METHODS[number]['value'],
      description: restock.note || restock.reference || '',
      is_opening_stock: Boolean((restock as any).is_opening_stock),
    });
    setDialogOpen(true);
  };

  // Restock ↔ Expense linkage is now maintained by the `trg_sync_restock_to_expense`
  // database trigger. The client no longer needs to delete or recreate matching
  // expense rows — inserting / updating / deleting a restock automatically keeps
  // its "Restock" expense in sync.


  const upsertRestockMovement = async ({
    restockId,
    productId,
    quantityAdded,
    quantityAfter,
    unitCost,
    sellingPrice,
    note,
    movementDate,
  }: {
    restockId: string;
    productId: string;
    quantityAdded: number;
    quantityAfter: number;
    unitCost: number;
    sellingPrice: number;
    note: string;
    movementDate: string;
  }) => {
    try {
      const { data: existingRows, error: selectError } = await supabase
        .from('stock_movements' as any)
        .select('id')
        .eq('source_table', 'restocks')
        .eq('source_id', restockId)
        .limit(1);
      if (selectError) throw selectError;

      const payload = {
        business_id: businessId,
        product_id: productId,
        movement_type: 'restock',
        quantity_change: quantityAdded,
        quantity_after: quantityAfter,
        unit_cost: unitCost,
        unit_price: sellingPrice,
        note,
        created_by: user?.id,
        created_by_name: displayName || user?.email || '',
        movement_date: movementDate,
        source_table: 'restocks',
        source_id: restockId,
      };

      const existingMovement = (existingRows || [])[0] as { id: string } | undefined;
      if (existingMovement?.id) {
        const { error: updateError } = await supabase
          .from('stock_movements' as any)
          .update(payload)
          .eq('id', existingMovement.id);
        if (updateError) throw updateError;
        return;
      }

      const movementResult = await insertStockMovementCompat(payload);
      if (movementResult.skipped) {
        logSupabaseError('inventory.upsertRestockMovement.skipped', new Error('stock_movements table unavailable'), {
          restockId,
          productId,
        });
      }
    } catch (error) {
      logSupabaseError('inventory.upsertRestockMovement', error, {
        restockId,
        productId,
      });
    }
  };

  const deleteRestockMovement = async (restockId: string) => {
    try {
      const { error } = await supabase
        .from('stock_movements' as any)
        .delete()
        .eq('source_table', 'restocks')
        .eq('source_id', restockId);
      if (error) throw error;
    } catch (error) {
      logSupabaseError('inventory.deleteRestockMovement', error, { restockId });
    }
  };

  const saveRestock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId || !selectedProduct || !canManage) return;

    const quantity = Math.max(0, Number(form.quantity || 0));
    const unitCost = Number(form.unit_cost || 0);
    const sellingPrice = Number(form.selling_price || selectedProduct?.selling_price || 0);
    if (quantity <= 0) {
      toast({ title: 'Quantity must be at least 1', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const totalCost = unitCost * quantity;
      const movementDate = new Date(`${form.movement_date}T00:00:00`).toISOString();

      const restockPayload = {
        user_id: effectiveBusinessOwnerId ?? user.id,
        business_id: businessId,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: '',
        category: selectedProduct.category || '',
        supplier: selectedProduct.supplier || '',
        quantity_added: quantity,
        cost_price_per_unit: unitCost,
        total_cost: totalCost,
        restock_date: movementDate,
        recorded_by: user.id,
        recorded_by_name: displayName || user.email || '',
        payment_method: form.payment_method,
        note: form.description,
        reference: form.description || null,
        status: 'active',
        is_opening_stock: form.is_opening_stock,
      };

      const savedRestock = editingRestock
        ? (await updateRestockRecord(editingRestock.id, restockPayload), {
            ...editingRestock,
            ...restockPayload,
            id: editingRestock.id,
          } as RestockRow)
        : ((await insertRestockRecord(restockPayload)) as unknown as RestockRow);

      // DB trigger `trg_sync_restock_to_expense` keeps the linked expense row in sync.


      const { error: productError } = await supabase
        .from('products')
        .update({
          cost: unitCost,
          price: sellingPrice,
        } as never)
        .eq('id', selectedProduct.id);
      if (productError) throw productError;

      await recomputeProductStock();

      setDialogOpen(false);
      resetForm();
      toast({
        title: editingRestock ? 'Restock updated' : 'Restock saved',
        description: 'Stock, stock value, and available business money were recalculated.',
      });
      void load();
    } catch (error) {
      logSupabaseError('inventory.saveRestock', error, {
        businessId,
        productId: selectedProduct.id,
        editingRestockId: editingRestock?.id ?? null,
      });
      toast({
        title: editingRestock ? 'Could not update restock' : 'Could not save restock',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveDamagedGoods = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId || !selectedDamageProduct || !canRecordDamage) return;

    const quantity = Number(damageForm.quantity || 0);
    const currentStock = toNumber(selectedDamageProduct.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Damaged quantity must be greater than 0', variant: 'destructive' });
      return;
    }

    if (!Number.isInteger(quantity)) {
      toast({ title: 'Damaged quantity must be a whole number', variant: 'destructive' });
      return;
    }

    if (quantity > currentStock) {
      toast({
        title: 'Insufficient stock',
        description: `Only ${currentStock} item(s) are currently available for ${selectedDamageProduct.name}.`,
        variant: 'destructive',
      });
      return;
    }

    if (!damageForm.reason) {
      toast({ title: 'Choose a reason for damage', variant: 'destructive' });
      return;
    }

    setDamageSaving(true);
    try {
      const rpcArgs = {
        _business_id: businessId,
        _damage_date: new Date(`${damageForm.damage_date}T00:00:00`).toISOString(),
        _notes: damageForm.notes || null,
        _product_id: selectedDamageProduct.id,
        _quantity: quantity,
        _reason: damageForm.reason,
        _recorded_by_name: displayName || user.email || '',
      };

      const result = await supabase.rpc('record_damaged_goods_v2' as any, rpcArgs);
      let error = result.error;

      if (error && isMissingDamagedGoodsSchemaError(error)) {
        const fallback = await supabase.rpc('record_damaged_goods' as any, {
          _product_id: selectedDamageProduct.id,
          _quantity: quantity,
          _reason: damageForm.reason,
          _damage_date: rpcArgs._damage_date,
          _notes: rpcArgs._notes,
          _business_id: businessId,
          _recorded_by_name: rpcArgs._recorded_by_name,
        });
        error = fallback.error;
      }

      if (error) throw error;

      setDamageDialogOpen(false);
      resetDamageForm();
      toast({
        title: 'Damaged goods recorded',
        description: `${quantity} item(s) were deducted from ${selectedDamageProduct.name}. Business money, sales, and profit were not changed.`,
      });
      void load();
    } catch (error) {
      logSupabaseError('inventory.saveDamagedGoods', error, {
        businessId,
        productId: selectedDamageProduct.id,
      });
      toast({
        title: 'Could not record damaged goods',
        description: getErrorMessage(error, 'Please check the quantity and try again.'),
        variant: 'destructive',
      });
    } finally {
      setDamageSaving(false);
    }
  };

  const deleteRestock = async (restock: RestockRow) => {
    if (!businessId || !canManage) return;
    const confirmed = window.confirm(`Delete restock for ${restock.product_name}? This will adjust stock immediately.`);
    if (!confirmed) return;
    setDeletingRestockId(restock.id);
    try {
      // DB trigger removes the linked expense automatically when the restock is deleted.


      const { error: restockError } = await supabase.from('restocks').delete().eq('id', restock.id);
      if (restockError) throw restockError;

      await recomputeProductStock();

      toast({ title: 'Restock deleted', description: 'Stock and available business money were recalculated.' });
      void load();
    } catch (error) {
      toast({
        title: 'Could not delete restock',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingRestockId(null);
    }
  };

  return (
    <AppLayout title="Inventory">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
                    Opening Stock
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  {SIKAFLOW_TOOLTIPS.openingStock}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Track opening stock, restocks, returns, damaged stock, and manual adjustments. Products appear in stock only after you add inventory here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Available Business Money</p>
              <p className="mt-1 text-lg font-semibold">{financialsLoading ? 'Loading…' : formatCurrency(financials.availableBusinessMoney)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{AVAILABLE_BUSINESS_MONEY_FORMULA}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Stock Value (Cost)</p>
              <p className="mt-1 text-lg font-semibold">{financialsLoading ? 'Loading…' : formatCurrency(financials.stockValue)}</p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {isAdmin ? (
                  <Button
                    variant="outline"
                    onClick={handleRecomputeStock}
                    disabled={recomputing}
                    title="Rebuild each product's available stock from the stock_movements ledger."
                  >
                    <RefreshCcw className={`mr-2 h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} />
                    {recomputing ? 'Recalculating…' : 'Recalculate Stock'}
                  </Button>
                ) : null}
                <Button onClick={openCreateRestock}><Plus className="mr-2 h-4 w-4" /> Add Restock</Button>
              </div>
            ) : null}
            {canRecordDamage ? (
              <Button variant="outline" onClick={openRecordDamage}>
                <PackageMinus className="mr-2 h-4 w-4" />
                Damaged Goods
              </Button>
            ) : null}
          </div>
        </section>

        {lowStockProducts.length > 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Low stock: {lowStockProducts.map((product) => `${product.name} (${product.quantity})`).join(', ')}
            </AlertDescription>
          </Alert>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editingRestock ? 'Edit Restock' : 'Add Restock'}</DialogTitle>
              <DialogDescription>
                Add inventory quantity and cost details. Normal restocks affect cash, while opening stock does not.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveRestock}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={form.product_id}
                    disabled={!!editingRestock}
                    onValueChange={(value) => {
                      const product = products.find((item) => item.id === value);
                      setForm((current) => ({
                        ...current,
                        product_id: value,
                        unit_cost: String(Number(product?.cost_price || 0)),
                        selling_price: String(Number(product?.selling_price || 0)),
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} • {product.quantity} in stock
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.movement_date} onChange={(event) => setForm((current) => ({ ...current, movement_date: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Quantity Added</Label>
                  <Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Per Unit (Buying Price)</Label>
                  <Input type="number" min="0" step="0.001" value={form.unit_cost} onChange={(event) => setForm((current) => ({ ...current, unit_cost: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price (Customer Price)</Label>
                  <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={(event) => setForm((current) => ({ ...current, selling_price: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Total Cost (Buying Cost)</Label>
                  <Input value={formatCurrency(totalRestockCost)} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Stock Value (Cost)</Label>
                  <Input value={formatCurrency(restockStockValueCost)} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={(value) => setForm((current) => ({ ...current, payment_method: value as typeof current.payment_method }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Note / Reference (optional)</Label>
                  <Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="md:col-span-2 flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <input
                    id="is_opening_stock"
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={form.is_opening_stock}
                    onChange={(event) => setForm((current) => ({ ...current, is_opening_stock: event.target.checked }))}
                  />
                  <label htmlFor="is_opening_stock" className="text-sm">
                    <span className="font-medium">This is opening stock</span>
                    <p className="text-xs text-muted-foreground">
                      Opening stock adds quantity but does NOT deduct from Available Business Money. Leave unchecked for normal restocks.
                    </p>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-medium">Restock money logic</p>
                <p className="text-xs text-muted-foreground">
                  Normal restocks are automatically deducted from Available Business Money. Opening Stock entries are not deducted.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : editingRestock ? 'Update Restock' : 'Save Restock'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={damageDialogOpen} onOpenChange={setDamageDialogOpen}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Record Damaged Goods</DialogTitle>
              <DialogDescription>
                Deduct unsellable stock as inventory loss without changing sales, profit, other income, or available business money.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveDamagedGoods}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={damageForm.product_id}
                    onValueChange={(value) => setDamageForm((current) => ({ ...current, product_id: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} • {product.quantity} in stock
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Damage Date</Label>
                  <Input
                    type="date"
                    value={damageForm.damage_date}
                    onChange={(event) => setDamageForm((current) => ({ ...current, damage_date: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Damaged Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={damageForm.quantity}
                    onChange={(event) => setDamageForm((current) => ({ ...current, quantity: event.target.value }))}
                  />
                  {selectedDamageProduct ? (
                    <p className="text-xs text-muted-foreground">{selectedDamageProduct.quantity} item(s) currently available</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Select
                    value={damageForm.reason}
                    onValueChange={(value) => setDamageForm((current) => ({ ...current, reason: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose reason" /></SelectTrigger>
                    <SelectContent>
                      {DAMAGE_REASONS.map((reason) => (
                        <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estimated Stock Loss</Label>
                  <Input value={formatCurrency(damagePreviewValue)} readOnly />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    rows={3}
                    value={damageForm.notes}
                    onChange={(event) => setDamageForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Add batch, supplier, or incident details"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-200">Damaged goods money logic</p>
                <p className="text-xs text-muted-foreground">
                  This deducts stock and records inventory loss only. It does not add sales, profit, other income, or available business money.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={damageSaving}>
                {damageSaving ? 'Recording...' : 'Record Damaged Goods'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Current Stock</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inventoryProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Low Stock</TableHead>
                        <TableHead>Stock Value (Cost)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryProducts.map((product) => {
                        const quantity = toNumber(product.quantity);
                        const stockStatus = getStockStatus(product);
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">
                              {product.name}
                            </TableCell>
                            <TableCell>{product.category || '—'}</TableCell>
                            <TableCell className={quantity < 0 ? 'font-semibold text-amber-300' : quantity === 0 ? 'font-medium text-rose-300' : undefined}>
                              {quantity}
                            </TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${stockStatus.className}`}>
                                {stockStatus.label}
                              </span>
                            </TableCell>
                            <TableCell>{product.low_stock_threshold ?? product.reorder_level ?? 0}</TableCell>
                            <TableCell>{formatCurrency(quantity * Number(product.cost_price || 0))}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<Boxes className="h-7 w-7 text-muted-foreground" />}
                  title="No products in inventory yet"
                  description="Add products first, then use Add Restock to bring them into stock. Products with Opening Stock stay visible here too."
                />
              )}
            </CardContent>
          </Card>

          {canRecordDamage || damagedGoods.length > 0 ? (
            <Card className="border-amber-500/25">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PackageMinus className="h-5 w-5 text-amber-500" />
                    Damaged Goods
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Track damaged stock as inventory loss. It reduces stock only, not sales, income, profit, or cash.
                  </p>
                </div>
                {canRecordDamage ? (
                  <Button onClick={openRecordDamage}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Damage
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Damaged Quantity</p>
                    <p className="mt-2 text-2xl font-semibold">{damagedGoodsSummary.quantity}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Estimated Stock Loss</p>
                    <p className="mt-2 text-2xl font-semibold">{formatCurrency(damagedGoodsSummary.value)}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Products Affected</p>
                    <p className="mt-2 text-2xl font-semibold">{damagedGoodsByProduct.length}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={damageProductFilter} onValueChange={setDamageProductFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All products</SelectItem>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select value={damageReasonFilter} onValueChange={setDamageReasonFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All reasons</SelectItem>
                        {DAMAGE_REASONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>From</Label>
                    <Input type="date" value={damageDateFrom} onChange={(event) => setDamageDateFrom(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>To</Label>
                    <Input type="date" value={damageDateTo} onChange={(event) => setDamageDateTo(event.target.value)} />
                  </div>
                </div>

                {(damageProductFilter !== 'all' || damageReasonFilter !== 'all' || damageDateFrom || damageDateTo) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDamageProductFilter('all');
                      setDamageReasonFilter('all');
                      setDamageDateFrom('');
                      setDamageDateTo('');
                    }}
                  >
                    Clear damaged goods filters
                  </Button>
                ) : null}

                {damagedGoodsByProduct.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Total Damaged</TableHead>
                          <TableHead>Estimated Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {damagedGoodsByProduct.map((entry) => (
                          <TableRow key={entry.productId}>
                            <TableCell className="font-medium">{entry.productName}</TableCell>
                            <TableCell>{entry.quantity}</TableCell>
                            <TableCell>{formatCurrency(entry.value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}

                {filteredDamagedGoods.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Stock After</TableHead>
                          <TableHead>Recorded By</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDamagedGoods.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.damage_date).toLocaleDateString('en-GH')}</TableCell>
                            <TableCell className="font-medium">{entry.product_name}</TableCell>
                            <TableCell>{entry.quantity}</TableCell>
                            <TableCell>
                              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                {entry.reason}
                              </span>
                            </TableCell>
                            <TableCell>{formatCurrency(getDamagedGoodsValue(entry))}</TableCell>
                            <TableCell>{entry.quantity_after}</TableCell>
                            <TableCell>{entry.recorded_by_name || '—'}</TableCell>
                            <TableCell className="max-w-[240px] truncate">{entry.notes || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState
                    icon={<PackageMinus className="h-7 w-7 text-muted-foreground" />}
                    title="No damaged goods recorded"
                    description="Damaged goods history will appear here with reason, recorder, and estimated stock loss."
                  />
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Restock History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {restocks.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity Added</TableHead>
                        <TableHead>Cost Per Unit</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Deduction Status</TableHead>
                        <TableHead>Note / Reference</TableHead>
                        <TableHead>Created By</TableHead>
                        {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryHistory.map((entry) => {
                        const isOpeningStock = entry.entryType === 'opening_stock';
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.date).toLocaleDateString('en-GH')}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isOpeningStock ? 'bg-sky-500/10 text-sky-300' : 'bg-primary/10 text-primary'}`}>
                                {isOpeningStock ? 'Opening Stock' : 'Restock'}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{entry.productName}</TableCell>
                            <TableCell>{entry.category || '—'}</TableCell>
                            <TableCell>{entry.quantityAdded}</TableCell>
                            <TableCell>{formatCurrency(entry.costPerUnit)}</TableCell>
                            <TableCell>{formatCurrency(entry.totalCost)}</TableCell>
                            <TableCell>{entry.paymentMethod ? (PAYMENT_METHODS.find((method) => method.value === entry.paymentMethod)?.label ?? entry.paymentMethod) : '—'}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isOpeningStock ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                {entry.deductionStatus}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate">{entry.noteReference || '—'}</TableCell>
                            <TableCell>{entry.createdByName || '—'}</TableCell>
                            {canManage ? (
                              <TableCell className="text-right">
                                {entry.editableRestock ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditRestock(entry.editableRestock!)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      disabled={deletingRestockId === entry.editableRestock.id}
                                      onClick={() => void deleteRestock(entry.editableRestock!)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Setup only</span>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />}
                  title="No restocks yet"
                  description="Opening Stock and restocks will appear here with deduction status, payment details, and edit/delete actions."
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Stock Movement History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {stockMovementHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity Change</TableHead>
                        <TableHead>Stock After</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Recorded By</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockMovementHistory.map((movement) => {
                        const product = movement.product_id ? products.find((row) => row.id === movement.product_id) : null;
                        const typeLabel = movementTypeLabels.get(movement.movement_type) ?? movement.movement_type;
                        const isDamage = movement.movement_type === 'damaged_stock';
                        const quantityChange = toNumber(movement.quantity_change);

                        return (
                          <TableRow key={movement.id}>
                            <TableCell>{new Date(movement.movement_date).toLocaleDateString('en-GH')}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isDamage ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                                {typeLabel}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{product?.name || '—'}</TableCell>
                            <TableCell className={quantityChange < 0 ? 'font-semibold text-destructive' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
                              {quantityChange > 0 ? `+${quantityChange}` : quantityChange}
                            </TableCell>
                            <TableCell>{movement.quantity_after ?? '—'}</TableCell>
                            <TableCell>{formatCurrency(toNumber(movement.unit_cost ?? 0))}</TableCell>
                            <TableCell>{movement.created_by_name || '—'}</TableCell>
                            <TableCell className="max-w-[260px] truncate">{movement.note || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<History className="h-7 w-7 text-muted-foreground" />}
                  title="No stock movements yet"
                  description="Opening stock, restocks, sales, damaged goods, and manual adjustments will appear here."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
