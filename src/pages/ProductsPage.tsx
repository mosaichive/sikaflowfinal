import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/constants';
import { Package, Plus, Search, Pencil, Trash2, ArchiveRestore, Archive, ImagePlus, X } from 'lucide-react';
import { uploadProductImage } from '@/lib/product-images';
import {
  createProductRecord,
  ensureUserBusinessWorkspace,
  getErrorMessage,
  loadProductsCompat,
  logSupabaseError,
  rememberCachedProduct,
  removeCachedProduct,
  updateProductRecord,
} from '@/lib/workspace';

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  cost_price: number | string;
  selling_price: number | string;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  image_url?: string | null;
  is_archived?: boolean | null;
  available_online?: boolean | null;
  online_description?: string | null;
};

const emptyForm = {
  name: '',
  category: '',
  cost_price: '0',
  selling_price: '0',
  low_stock_threshold: '3',
  available_online: false,
  online_description: '',
};

const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function generateSku(name: string) {
  const base = name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ITEM';
  return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function ProductsPage() {
  const { isAdmin, isManager, user, displayName, effectiveBusinessOwnerId } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canManage = isAdmin || isManager;

  const resetProductImage = useCallback(() => {
    setProductImageFile(null);
    setProductImagePreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return '';
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const resetDialogState = useCallback(() => {
    setEditing(null);
    setForm(emptyForm);
    resetProductImage();
  }, [resetProductImage]);

  useEffect(() => {
    return () => {
      if (productImagePreview.startsWith('blob:')) URL.revokeObjectURL(productImagePreview);
    };
  }, [productImagePreview]);

  const load = useCallback(async () => {
    const data = await loadProductsCompat(showArchived, businessId);
    setRows(data as ProductRow[]);
  }, [businessId, showArchived]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('products-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void load(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        [row.name, row.sku, row.category]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    resetProductImage();
    setOpen(true);
  };

  const openEdit = (row: ProductRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      category: row.category || '',
      cost_price: String(row.cost_price ?? 0),
      selling_price: String(row.selling_price ?? 0),
      low_stock_threshold: String(row.low_stock_threshold ?? row.reorder_level ?? 3),
      available_online: Boolean(row.available_online),
      online_description: row.online_description ?? '',
    });
    setProductImageFile(null);
    setProductImagePreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return row.image_url || '';
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setOpen(true);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetDialogState();
  };

  const handleProductImageSelect = (file?: File | null) => {
    if (!file) return;

    if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: 'Unsupported image type',
        description: 'Upload a JPG, PNG, or WEBP product image.',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      toast({
        title: 'Image too large',
        description: 'Keep product images under 4MB.',
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setProductImageFile(file);
    setProductImagePreview((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return previewUrl;
    });
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canManage) return;
    setSaving(true);

    try {
      const activeBusinessId = await ensureUserBusinessWorkspace({
        existingBusinessId: businessId,
        user,
        displayName: displayName || user.email || undefined,
        allowCreate: false,
      });
      if (!activeBusinessId) {
        toast({
          title: 'Complete setup first',
          description: 'Create your business workspace from the setup flow before adding products.',
          variant: 'destructive',
        });
        navigate('/dashboard', { replace: true });
        return;
      }

      const lowStockThreshold = Math.max(0, Number(form.low_stock_threshold || 0));
      let imageUrl: string | null = productImageFile ? (editing?.image_url ?? null) : (productImagePreview || null);
      let imageUploadError: unknown = null;

      const uploadAndAttachProductImage = async (productId: string) => {
        if (!productImageFile) return imageUrl;

        try {
          const uploadedUrl = await uploadProductImage({
            businessId: activeBusinessId,
            productId,
            file: productImageFile,
          });
          await updateProductRecord(productId, { image_url: uploadedUrl });
          return uploadedUrl;
        } catch (error) {
          imageUploadError = error;
          logSupabaseError('products.imageUpload', error, {
            businessId: activeBusinessId,
            productId,
            fileType: productImageFile.type,
            fileSize: productImageFile.size,
          });
          return imageUrl;
        }
      };

      const basePayload = {
        business_id: activeBusinessId,
        user_id: effectiveBusinessOwnerId ?? user.id,
        name: form.name.trim(),
        category: form.category.trim(),
        cost_price: Number(form.cost_price || 0),
        selling_price: Number(form.selling_price || 0),
        reorder_level: lowStockThreshold,
        low_stock_threshold: lowStockThreshold,
        image_url: imageUrl,
        is_archived: false,
        available_online: !!form.available_online,
        online_description: form.online_description?.trim() || null,
      };

      if (editing) {
        const payload = {
          ...basePayload,
          sku: editing.sku,
        };
        await updateProductRecord(editing.id, payload);
        imageUrl = await uploadAndAttachProductImage(editing.id);

        const savedPayload = {
          ...payload,
          image_url: imageUrl,
        };

        setRows((current) =>
          current.map((row) =>
            row.id === editing.id
              ? {
                  ...row,
                  ...savedPayload,
                }
              : row,
          ),
        );
        rememberCachedProduct(activeBusinessId, {
          id: editing.id,
          ...savedPayload,
        });
        toast({
          title: 'Product updated',
          description: imageUploadError
            ? `Product details were saved, but the image could not upload: ${getErrorMessage(imageUploadError)}`
            : undefined,
        });
      } else {
        const payload = {
          ...basePayload,
          sku: generateSku(form.name),
          quantity: 0,
        };
        const created = await createProductRecord(payload);
        imageUrl = await uploadAndAttachProductImage(created.id);

        const savedPayload = {
          ...payload,
          image_url: imageUrl,
        };

        setRows((current) => {
          const nextRow: ProductRow = {
            id: created.id,
            name: savedPayload.name,
            category: savedPayload.category,
            sku: savedPayload.sku,
            quantity: 0,
            cost_price: Number(savedPayload.cost_price ?? 0),
            selling_price: Number(savedPayload.selling_price ?? 0),
            low_stock_threshold: Number(savedPayload.low_stock_threshold ?? savedPayload.reorder_level ?? 0),
            reorder_level: Number(savedPayload.reorder_level ?? savedPayload.low_stock_threshold ?? 0),
            image_url: imageUrl,
            is_archived: false,
          };

          const withoutDuplicate = current.filter((row) => row.id !== nextRow.id);
          return [nextRow, ...withoutDuplicate].sort((left, right) => left.name.localeCompare(right.name));
        });
        rememberCachedProduct(activeBusinessId, {
          id: created.id,
          ...savedPayload,
        });
        toast({
          title: 'Product added',
          description: imageUploadError
            ? `Product was saved, but the image could not upload: ${getErrorMessage(imageUploadError)}`
            : 'Add stock later from Inventory.',
        });
      }

      setOpen(false);
      resetDialogState();
      void load();
    } catch (error) {
      logSupabaseError('products.save', error, {
        editingId: editing?.id ?? null,
        businessId,
        userId: user.id,
      });
      toast({
        title: 'Could not save product',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (row: ProductRow) => {
    const { error } = await supabase.from('products').update({ is_archived: !row.is_archived } as never).eq('id', row.id);
    if (error) {
      toast({ title: 'Could not update product', description: error.message, variant: 'destructive' });
      return;
    }
    if (businessId) {
      rememberCachedProduct(businessId, {
        ...row,
        is_archived: !row.is_archived,
      });
    }
    toast({ title: row.is_archived ? 'Product restored' : 'Product archived' });
    void load();
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete product', description: error.message, variant: 'destructive' });
      return;
    }
    if (businessId) {
      removeCachedProduct(businessId, id);
    }
    toast({ title: 'Product deleted' });
    void load();
  };

  return (
    <AppLayout title="Products">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
            <p className="text-sm text-muted-foreground">
              Manage your product catalog, prices, stock thresholds, and archived items. Use Inventory to add or restock stock quantities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
            {canManage ? (
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
            ) : null}
          </div>
        </section>

        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveProduct}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Product Name</Label>
                  <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Category <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                  <Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => setForm((current) => ({ ...current, cost_price: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={(event) => setForm((current) => ({ ...current, selling_price: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(event) => setForm((current) => ({ ...current, low_stock_threshold: event.target.value }))} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Product Image <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                  <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-background">
                      {productImagePreview ? (
                        <img src={productImagePreview} alt="Product preview" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-7 w-7 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={(event) => handleProductImageSelect(event.target.files?.[0])}
                      />
                      <p className="text-xs text-muted-foreground">Upload a JPG, PNG, or WEBP image under 4MB.</p>
                    </div>
                    {productImagePreview ? (
                      <Button type="button" variant="outline" size="sm" onClick={resetProductImage}>
                        <X className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2 rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="font-medium">Available for online ordering</Label>
                      <p className="text-xs text-muted-foreground mt-1">Show this product on your public store link.</p>
                    </div>
                    <Switch
                      checked={!!form.available_online}
                      onCheckedChange={(v) => setForm((current) => ({ ...current, available_online: v }))}
                    />
                  </div>
                  {form.available_online ? (
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs">Public description <span className="text-muted-foreground">(optional)</span></Label>
                      <Textarea
                        rows={3}
                        maxLength={500}
                        placeholder="Short description customers will see on your store."
                        value={form.online_description}
                        onChange={(event) => setForm((current) => ({ ...current, online_description: event.target.value }))}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Product' : 'Save Product'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {filteredRows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Selling</TableHead>
                      <TableHead>Low Stock</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                              {row.image_url ? <img src={row.image_url} alt={row.name} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <div>
                              <p className="font-medium">{row.name}</p>
                              <p className="text-xs text-muted-foreground">Ready for inventory restock</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{row.category || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{formatCurrency(Number(row.cost_price || 0))}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(row.selling_price || 0))}</TableCell>
                        <TableCell>{row.low_stock_threshold ?? row.reorder_level ?? 0}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => void toggleArchive(row)}>
                                {row.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void deleteProduct(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Package className="h-7 w-7 text-muted-foreground" />}
                title="No products yet"
                description="Add your first product and opening stock to start selling."
                action={canManage ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Product</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
