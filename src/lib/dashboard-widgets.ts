import type { ModuleKey } from '@/lib/permissions';

export type WidgetSize = 1 | 2 | 3 | 4;

export type DashboardWidgetId =
  | 'daily_sales'
  | 'total_sales'
  | 'total_profit'
  | 'total_expenses'
  | 'business_money'
  | 'stock_left'
  | 'inventory_value'
  | 'low_stock_alerts'
  | 'other_income'
  | 'savings'
  | 'sales_chart'
  | 'expense_chart'
  | 'low_stock_panel'
  | 'recent_sales'
  | 'recent_expenses'
  | 'top_products'
  | 'outstanding_credit'
  | 'stock_movements'
  | 'quick_actions';

export type WidgetLayoutItem = {
  id: DashboardWidgetId;
  visible: boolean;
  size: WidgetSize;
};

export type WidgetDef = {
  id: DashboardWidgetId;
  label: string;
  description: string;
  /** Module permission required to see this widget (undefined = always allowed). */
  module?: ModuleKey;
  defaultSize: WidgetSize;
  defaultVisible: boolean;
  /** Sizes the user can choose from; single entry means not resizable. */
  sizes: WidgetSize[];
  group: 'Key metrics' | 'Charts' | 'Lists & activity';
};

export const DASHBOARD_WIDGETS: WidgetDef[] = [
  { id: 'daily_sales', label: "Today's Sales", description: 'Sales made today (or for the selected period).', module: 'sales', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'total_profit', label: 'Total Profit', description: 'Profit for the selected period.', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'total_expenses', label: 'Total Expenses', description: 'Expenses for the selected period.', module: 'expenses', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'business_money', label: 'Available Business Money', description: 'Cash position as of the selected period.', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'total_sales', label: 'Total Sales / Revenue', description: 'Total paid sales revenue for the period.', module: 'sales', defaultSize: 1, defaultVisible: false, sizes: [1, 2], group: 'Key metrics' },
  { id: 'stock_left', label: 'Stock Left', description: 'Live inventory units in stock.', module: 'inventory', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'other_income', label: 'Other Income', description: 'Non-sales income for the period.', module: 'other_income', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'low_stock_alerts', label: 'Low Stock Alerts', description: 'Count of products at or below their threshold.', module: 'inventory', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'savings', label: 'Savings', description: 'Savings recorded in the period.', module: 'savings', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Key metrics' },
  { id: 'inventory_value', label: 'Inventory Value', description: 'Cost value of current stock on hand.', module: 'inventory', defaultSize: 1, defaultVisible: false, sizes: [1, 2], group: 'Key metrics' },
  { id: 'outstanding_credit', label: 'Outstanding Credit', description: 'Unpaid balances owed by customers.', module: 'sales', defaultSize: 1, defaultVisible: false, sizes: [1, 2], group: 'Key metrics' },

  { id: 'sales_chart', label: 'Sales Overview Chart', description: 'Yearly sales, profit and expense analytics.', defaultSize: 3, defaultVisible: true, sizes: [2, 3, 4], group: 'Charts' },
  { id: 'expense_chart', label: 'Expense Overview Chart', description: 'Monthly expense breakdown for the year.', module: 'expenses', defaultSize: 2, defaultVisible: false, sizes: [2, 3, 4], group: 'Charts' },

  { id: 'low_stock_panel', label: 'Stock Levels Panel', description: 'Live stock levels with low-stock indicators.', module: 'inventory', defaultSize: 1, defaultVisible: true, sizes: [1, 2], group: 'Lists & activity' },
  { id: 'recent_sales', label: 'Recent Sales', description: 'Your most recent sales.', module: 'sales', defaultSize: 2, defaultVisible: true, sizes: [1, 2, 4], group: 'Lists & activity' },
  { id: 'recent_expenses', label: 'Recent Expenses', description: 'Your most recent expenses.', module: 'expenses', defaultSize: 2, defaultVisible: true, sizes: [1, 2, 4], group: 'Lists & activity' },
  { id: 'top_products', label: 'Top-Selling Products', description: 'Best performing products for the period.', module: 'products', defaultSize: 2, defaultVisible: false, sizes: [1, 2, 4], group: 'Lists & activity' },
  { id: 'stock_movements', label: 'Recent Stock Movements', description: 'Latest inventory in/out movements.', module: 'inventory', defaultSize: 2, defaultVisible: false, sizes: [1, 2, 4], group: 'Lists & activity' },
  { id: 'quick_actions', label: 'Quick Actions', description: 'Shortcuts to common tasks.', defaultSize: 2, defaultVisible: false, sizes: [1, 2, 4], group: 'Lists & activity' },
];

export const WIDGET_MAP: Record<string, WidgetDef> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]),
);

export function defaultDashboardLayout(): WidgetLayoutItem[] {
  return DASHBOARD_WIDGETS.map((widget) => ({
    id: widget.id,
    visible: widget.defaultVisible,
    size: widget.defaultSize,
  }));
}

function isValidItem(value: unknown): value is WidgetLayoutItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WidgetLayoutItem>;
  return typeof item.id === 'string' && Boolean(WIDGET_MAP[item.id]);
}

/**
 * Merges a saved layout with the widget registry so new widgets appear and
 * removed widgets disappear. Unknown / malformed entries are dropped.
 */
export function normalizeLayout(saved: unknown): WidgetLayoutItem[] {
  const defaults = defaultDashboardLayout();
  if (!Array.isArray(saved) || saved.length === 0) return defaults;

  const seen = new Set<string>();
  const merged: WidgetLayoutItem[] = [];

  saved.filter(isValidItem).forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const def = WIDGET_MAP[item.id];
    const size = def.sizes.includes(item.size as WidgetSize) ? (item.size as WidgetSize) : def.defaultSize;
    merged.push({ id: item.id, visible: item.visible !== false, size });
  });

  defaults.forEach((item) => {
    if (!seen.has(item.id)) merged.push(item);
  });

  return merged;
}

/** Widgets the current user is allowed to see, in saved order. */
export function visibleLayout(layout: WidgetLayoutItem[], hasModule: (module: ModuleKey) => boolean) {
  return layout.filter((item) => {
    const def = WIDGET_MAP[item.id];
    if (!def) return false;
    if (!item.visible) return false;
    return def.module ? hasModule(def.module) : true;
  });
}

export function allowedWidgets(hasModule: (module: ModuleKey) => boolean) {
  return DASHBOARD_WIDGETS.filter((widget) => (widget.module ? hasModule(widget.module) : true));
}

export function sizeClass(size: WidgetSize) {
  if (size >= 4) return 'sm:col-span-2 xl:col-span-4';
  if (size === 3) return 'sm:col-span-2 xl:col-span-3';
  if (size === 2) return 'sm:col-span-2 xl:col-span-2';
  return 'sm:col-span-1 xl:col-span-1';
}

export function sizeLabel(size: WidgetSize) {
  if (size >= 4) return 'Full width';
  if (size === 3) return 'Large';
  if (size === 2) return 'Medium';
  return 'Small';
}
