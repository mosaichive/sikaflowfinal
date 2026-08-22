import { enqueueOperation } from '@/lib/offline-sync';
import { saveLocalSale } from '@/lib/offline-db';

export type OfflineSaleLine = {
  product_id: string;
  product_name: string;
  sku?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
};

export type OfflineSaleInput = {
  ownerId: string;
  businessId: string | null;
  customerName: string;
  customerPhone?: string | null;
  staffName?: string | null;
  saleDate: string;
  dueDate?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  amountPaid: number;
  balance: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string | null;
  items: OfflineSaleLine[];
};

/**
 * Records a sale entirely on-device and queues it for the idempotent server
 * sync. Returns a client transaction id that later becomes traceable via
 * sales.client_txn_id.
 */
export async function recordSaleOffline(input: OfflineSaleInput) {
  const customerTxnId =
    input.customerName && input.customerName.toLowerCase() !== 'walk-in'
      ? `cust_${crypto.randomUUID()}`
      : null;

  if (customerTxnId) {
    await enqueueOperation({
      kind: 'customer',
      ownerId: input.ownerId,
      businessId: input.businessId,
      payload: {
        name: input.customerName,
        phone: input.customerPhone ?? null,
      },
      label: `New customer: ${input.customerName}`,
      clientTxnId: customerTxnId,
    });
  }

  const clientTxnId = await enqueueOperation({
    kind: 'sale',
    ownerId: input.ownerId,
    businessId: input.businessId,
    amount: input.total,
    label: `Sale — ${input.customerName || 'Walk-in'}`,
    payload: {
      customer_name: input.customerName || 'Walk-in',
      customer_phone: input.customerPhone ?? null,
      customer_client_txn_id: customerTxnId,
      staff_name: input.staffName ?? null,
      sale_date: input.saleDate,
      due_date: input.dueDate ?? null,
      subtotal: input.subtotal,
      discount: input.discount,
      total: input.total,
      cost_total: input.costTotal,
      amount_paid: input.amountPaid,
      balance: input.balance,
      payment_method: input.paymentMethod,
      payment_status: input.paymentStatus,
      sale_channel: 'pos',
      notes: input.notes ?? null,
      items: input.items.map((line) => ({
        product_id: line.product_id,
        product_name: line.product_name,
        sku: line.sku ?? null,
        quantity: line.quantity,
        unit_price: line.unit_price,
        unit_cost: line.unit_cost,
        line_total: line.line_total,
      })),
    },
  });

  // Keep a full local copy so receipts print and history reads instantly,
  // before the server ever sees the record.
  await saveLocalSale({
    id: clientTxnId,
    ownerId: input.ownerId,
    businessId: input.businessId,
    serverId: null,
    createdAt: Date.now(),
    snapshot: {
      customer_name: input.customerName || 'Walk-in',
      customer_phone: input.customerPhone ?? null,
      sale_date: input.saleDate,
      subtotal: input.subtotal,
      discount: input.discount,
      total: input.total,
      amount_paid: input.amountPaid,
      balance: input.balance,
      payment_method: input.paymentMethod,
      payment_status: input.paymentStatus,
      notes: input.notes ?? null,
      staff_name: input.staffName ?? null,
      items: input.items,
    },
  });

  return clientTxnId;
}
