import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownUp, HandCoins, Package, Plus, Receipt, ShoppingCart, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function toNum(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
}

export function WidgetCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function Row({ primary, secondary, value, tone }: { primary: string; secondary?: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{primary}</p>
        {secondary ? <p className="truncate text-xs text-muted-foreground">{secondary}</p> : null}
      </div>
      <span className={cn('shrink-0 text-sm font-semibold tabular-nums text-foreground', tone)}>{value}</span>
    </div>
  );
}

export function RecentSalesWidget({ sales }: { sales: any[] }) {
  const rows = [...sales]
    .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
    .slice(0, 6);
  return (
    <WidgetCard
      title="Recent Sales"
      action={<Link to="/sales" className="text-xs font-medium text-[#2C8603] hover:underline">View all</Link>}
    >
      {rows.length === 0 ? <EmptyRow text="No sales recorded yet." /> : rows.map((sale) => (
        <Row
          key={sale.id}
          primary={sale.customer_name || 'Walk-in customer'}
          secondary={`${shortDate(sale.sale_date)} · ${String(sale.payment_status || 'paid')}`}
          value={formatCurrency(toNum(sale.total))}
        />
      ))}
    </WidgetCard>
  );
}

export function RecentExpensesWidget({ expenses }: { expenses: any[] }) {
  const rows = [...expenses]
    .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
    .slice(0, 6);
  return (
    <WidgetCard
      title="Recent Expenses"
      action={<Link to="/expenses" className="text-xs font-medium text-[#2C8603] hover:underline">View all</Link>}
    >
      {rows.length === 0 ? <EmptyRow text="No expenses recorded yet." /> : rows.map((expense) => (
        <Row
          key={expense.id}
          primary={expense.description || expense.category || 'Expense'}
          secondary={`${shortDate(expense.expense_date)}${expense.category ? ` · ${expense.category}` : ''}`}
          value={formatCurrency(toNum(expense.amount))}
          tone="text-rose-600 dark:text-rose-400"
        />
      ))}
    </WidgetCard>
  );
}

export function TopProductsWidget({ saleItems }: { saleItems: any[] }) {
  const totals = new Map<string, { name: string; quantity: number; revenue: number }>();
  saleItems.forEach((item) => {
    const name = item.product_name || 'Unnamed product';
    const current = totals.get(name) || { name, quantity: 0, revenue: 0 };
    current.quantity += toNum(item.quantity);
    current.revenue += toNum(item.line_total) || toNum(item.quantity) * toNum(item.unit_price);
    totals.set(name, current);
  });
  const rows = Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return (
    <WidgetCard title="Top-Selling Products">
      {rows.length === 0 ? <EmptyRow text="No product sales in this period." /> : rows.map((row) => (
        <Row key={row.name} primary={row.name} secondary={`${row.quantity} sold`} value={formatCurrency(row.revenue)} />
      ))}
    </WidgetCard>
  );
}

export function OutstandingCreditListWidget({ sales }: { sales: any[] }) {
  const rows = sales
    .map((sale) => ({
      id: sale.id,
      name: sale.customer_name || 'Walk-in customer',
      date: sale.sale_date,
      balance: toNum(sale.balance) || Math.max(0, toNum(sale.total) - toNum(sale.amount_paid)),
    }))
    .filter((row) => row.balance > 0.009)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6);

  return (
    <WidgetCard title="Outstanding Credit">
      {rows.length === 0 ? <EmptyRow text="No unpaid sales. Nice!" /> : rows.map((row) => (
        <Row key={row.id} primary={row.name} secondary={shortDate(row.date)} value={formatCurrency(row.balance)} tone="text-amber-600 dark:text-amber-400" />
      ))}
    </WidgetCard>
  );
}

export function StockMovementsWidget({ movements }: { movements: any[] }) {
  const rows = movements.slice(0, 6);
  return (
    <WidgetCard
      title="Recent Stock Movements"
      action={<Link to="/inventory" className="text-xs font-medium text-[#2C8603] hover:underline">Inventory</Link>}
    >
      {rows.length === 0 ? <EmptyRow text="No stock movements recorded yet." /> : rows.map((movement) => {
        const change = toNum(movement.change);
        return (
          <Row
            key={movement.id}
            primary={movement.product_name || movement.reason || 'Stock change'}
            secondary={`${shortDate(movement.created_at)} · ${String(movement.reason || 'adjustment').replace(/_/g, ' ')}`}
            value={`${change > 0 ? '+' : ''}${change}`}
            tone={change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
          />
        );
      })}
    </WidgetCard>
  );
}

export function QuickActionsWidget({ hasModule }: { hasModule: (module: any) => boolean }) {
  const actions = [
    { key: 'sales', to: '/sales?newSale=1', label: 'New Sale', icon: ShoppingCart },
    { key: 'products', to: '/products', label: 'Add Product', icon: Package },
    { key: 'expenses', to: '/expenses', label: 'Record Expense', icon: Receipt },
    { key: 'other_income', to: '/other-income', label: 'Add Income', icon: HandCoins },
    { key: 'customers', to: '/customers', label: 'New Customer', icon: Users },
    { key: 'inventory', to: '/inventory', label: 'Restock', icon: ArrowDownUp },
  ].filter((action) => hasModule(action.key));

  return (
    <WidgetCard title="Quick Actions">
      {actions.length === 0 ? <EmptyRow text="No actions available for your role." /> : (
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <Button key={action.key} asChild variant="outline" className="h-11 justify-start gap-2 rounded-[10px]">
              <Link to={action.to}>
                <action.icon className="h-4 w-4 text-[#2C8603]" />
                <span className="truncate text-sm">{action.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

export { Plus };
