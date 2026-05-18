# Plan: Negative Cash-Flow Logic + Date-Filtered Dashboard

This is a substantial change that touches the accounting engine, the savings/expenses/investments flows, and the entire Dashboard. I'll split it into two coherent phases.

---

## PART 1 — Negative Available Business Money handling

### 1.1 Accounting engine (`src/lib/sales-inventory.ts`, `src/lib/business-money.ts`)
Extend `calculateFinancialSnapshot` with a new derived block:

- `todaySales` — paid sales recognized today
- `todayOutflows` — today's expenses + savings + investments
- `negativeOffsetToday` — `max(0, todaySales - todayOutflows)` applied against a negative balance
- `effectiveAvailableBusinessMoney` — when base ABM < 0, equals `base + negativeOffsetToday`; otherwise equals base

Expose helpers:
- `computeTransactionImpact({ availableBusinessMoney, todaySales, todayOutflows, amount, kind })` returning `{ balance_before, balance_after, sales_used, negative_offset_amount }`. Used by Savings/Expenses/Investments forms for audit logging and UI warning.

### 1.2 Remove blocking errors
- `SavingsPage.tsx` — already non-blocking, switch the AlertDialog to fire only when `amount > todaySalesRemaining` AND ABM is negative ("exceeds today's sales while negative").
- `ExpensesPage.tsx` — remove any "insufficient funds" blocker; add the same soft warning.
- `SavingsInvestmentsPage.tsx` (investments) — same treatment.

### 1.3 Transaction audit fields
Add a migration: new columns on `audit_log` are not needed — store the impact JSON in `audit_log.details` as a serialized JSON object containing `balance_before`, `amount`, `balance_after`, `sales_used`, `negative_offset_amount`. (No schema change required; just standardize the payload.)

### 1.4 UI helper text
- `Dashboard.tsx` Available Business Money card — when negative, show:
  > "New daily sales are being used to gradually offset negative cash flow."
- Color the card amber instead of red when offset is active.

---

## PART 2 — Date-Filtered Dashboard

### 2.1 New filter component (`src/components/dashboard/DateRangeFilter.tsx`)
Tabs: **Day · Month · Year · Custom Range**. Defaults to today. Persists in `useState` at Dashboard level; no URL state for now.

Uses shadcn `Popover` + `Calendar` (with `pointer-events-auto`) for day/range, native month/year selects for month/year tabs.

### 2.2 Dashboard wiring (`src/pages/Dashboard.tsx`)
- Add `dateRange: { from: Date; to: Date }` state.
- Derive `filteredFinancials` by passing the range into a new `calculateFinancialSnapshotInRange(args, range)` that filters `sales`, `saleItems` (via sale_id map), `expenses`, `other_income`, `savings`, `investments`, `investor_funds`, `restocks` by their date columns before delegating to the existing snapshot calculator.
- Stocks Left / Low Stock are point-in-time: when `range.to < today`, recompute from `stock_movements` up to `range.to` (sum of `change` per product). For today/future ranges, use current `products.stock`.
- Available Business Money for a past period = same snapshot formula on filtered data.

### 2.3 Cards reflect filter
Update these dashboard cards to read from `filteredFinancials`:
Available Business Money · Daily Sales · Total Profit · Stocks Left · Other Income · Low Stock Alerts.

### 2.4 Charts
The sales/profit chart already buckets by date — clip its domain to the selected range.

### 2.5 Exports
Pass the active range into the existing PDF/Excel report builders so exports match what's shown.

### 2.6 Realtime
Keep `BusinessFinancialsContext` realtime listeners; they trigger a recompute and the derived `filteredFinancials` reactively updates — no page refresh.

---

## Technical notes

- **No new DB tables.** All logic is client-side derived from existing rows. Audit metadata goes into `audit_log.details` as JSON.
- **Performance:** memoize `filteredFinancials` with `useMemo` keyed on raw arrays + range. Avoid extra round-trips.
- **Backwards compatible:** when `range = all-time`, results equal current behavior.

---

## Files touched

**New**
- `src/components/dashboard/DateRangeFilter.tsx`
- `src/lib/financial-filters.ts` (range-filtering helpers + `computeTransactionImpact`)

**Edited**
- `src/lib/sales-inventory.ts`, `src/lib/business-money.ts` — extended snapshot fields
- `src/context/BusinessFinancialsContext.tsx` — expose raw arrays for client-side filtering
- `src/pages/Dashboard.tsx` — filter UI + cards + helper text + charts
- `src/pages/SavingsPage.tsx`, `src/pages/ExpensesPage.tsx`, `src/pages/SavingsInvestmentsPage.tsx` — remove blockers, add soft warning + audit payload
- Report export utilities — accept range

Approve and I'll build it in this order: engine → savings/expenses/investments unblock → dashboard filter → charts/exports.
