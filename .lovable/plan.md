This is a large multi-area upgrade. Below is the plan grouped by area, ordered for safe execution. No destructive migrations; only additive schema/code changes. All existing data preserved.

## 1. Settings Page Restructure (UI-only)

Refactor `src/pages/SettingsPage.tsx` into a grouped layout with a left sidebar (desktop) / dropdown selector (mobile). All current cards/components stay — only regrouped:

- **Profile**: ProfileSettings, EmailVerificationCard, PhoneVerificationCard, RecoveryOptionsCard (password reset)
- **Sales Settings**:
  - Opening Cash Balance (existing field on profile)
  - Sales & Inventory: new toggle `allow_negative_stock` (profile field)
- **Bank**: Savings Destinations, Bank Account Details
- **Audit Log**: existing audit log view

No data resets. Routes unchanged.

## 2. Staff Invitation & Access Fix

**DB (additive migration):**
- Add `temp_password_hash` (optional) and `must_change_password` boolean to `staff_invites`
- No changes to `staff_members` schema

**Edge function `manage-business-user`:**
- Accept optional `temp_password`; when present, create user with that password via `admin.auth.admin.createUser` (email_confirm=true) so they can log in immediately
- Always create staff_invite row tied to `business_owner_id`
- Send email with login link + temp password (when SMTP available, otherwise return link)

**Frontend invite flow:**
- `BusinessOnboardingDialog` / `FirstTimeSetupDialog`: detect if the user has a pending accepted staff_invite OR an existing `staff_members` row → skip business setup entirely
- Already partially handled by `accept_staff_invite` RPC stamping `onboarding_completed = true`. Add guard in `BusinessContext` / `AppLayout` to never open the business setup dialog when user is a staff member
- New "Complete your staff profile" minimal dialog: only **Full Name** + **Position**, then call `accept_staff_invite(token, full_name, position)`
- `StaffUsersPage` add **Temporary Password** field in invite form

**Permissions enforcement:** Already enforced via `RequireModule` + `AppSidebar` filter. Audit that Settings sub-sections (Bank, Audit, subscription) are owner-only via `hasModule('settings')` + extra owner check `isOwner`.

## 3. Unified Financial Engine

Create a single source of truth: `src/lib/financial-engine.ts` that all callers use.

**Centralization:**
- `calculateBusinessFinancials` already exists in `src/lib/business-money.ts` (delegates to `sales-inventory.ts`). Make this the *only* path for available money + closing balance.
- Replace any duplicate "closing balance" math in Reports / PDFs / Financial Statement with calls to this engine.

**Running balance rebuild:**
- New `buildRunningLedger({ openingCash, events })` where events = chronologically sorted [paid sales, other income, investor funds, expenses, non-opening restocks, savings, investments]
- Each row: `balance = previousBalance + delta`
- Final row balance MUST equal `availableBusinessMoney` from snapshot — assert in dev with `warnIfFinancialInconsistency`

**Rules enforced:**
- Restocks deducted exactly once (skip `is_opening_stock=true`, skip `status='cancelled'`)
- Opening stock never affects cash
- Negative-day handling: when day cash goes negative, savings & expenses offset against same-day paid sales first (ordering logic in ledger builder)

**Apply across:** Dashboard cards, Reports financial statement, Inventory finance summary, PDF export, CSV export.

## 4. Dashboard Cleanup

Remove the Investments metric card from `src/pages/Dashboard.tsx` only. Keep all investments data + Savings/Investments page.

## 5. Reports Redesign

Rebuild `src/pages/ReportsPage.tsx`:
- Single reusable `<DynamicLineChart>` component (Recharts)
- Dropdown selector for: Sales | Product Performance | Other Income | Expenses | Inventory
- Date filter (day/month/year/custom) drives data
- Remove **Customer Credit Report** + **Payment Method Breakdown** UI cards (keep backend untouched)
- Smooth Framer-motion transitions on switch

## 6. Date Filter Consistency

- Single `DateRangeContext` (or hook) used by Dashboard cards
- All metric cards (Available Money, Sales, Expenses, Profit, etc.) accept date range
- Financial engine accepts `{ from, to }` and filters events by `sale_date`/`expense_date`/etc.
- Available Business Money for a range = opening cash + sums in range

## 7. Rebrand Sika Flow → KudiTrack

Search & replace remaining mentions in:
- UI strings (already mostly done)
- `docs/`, `README.md`, `public/manifest.webmanifest`, `public/llms.txt`, `index.html` meta, `supabase/manual/reset_sikaflow_fresh.sql` (file name kept; only contents text)
- Leave asset filenames (`sikaflow-logo.png`) and the special super-admin email `admin@sikaflow.com` untouched (that would break existing auth/data)

## 8. Final QA

- Verify build
- Manual smoke: dashboard with date filter, staff invite + accept, reports switching, settings groups
- Confirm closing balance == dashboard balance on multiple sample ranges

---

### Technical notes

- Additive migration only: `profiles.allow_negative_stock boolean default false`; `staff_invites.temp_password_hash text`, `staff_invites.must_change_password boolean default true`
- No removal of investments tables, customer credit data, or payment method tables
- All edits respect existing RLS / GRANT patterns
- Settings restructure stays within frontend only

### Out of scope (will not touch)

- Renaming the `sikaflow-logo.png` asset or the seed super-admin email
- Subscription/billing logic
- Auth provider configuration

Given the size, I'll execute in this order: rebrand quick passes → migration → financial engine → dashboard → reports → date filter → settings restructure → staff flow. I'll commit each area as I go.