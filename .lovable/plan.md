## KudiTrack — 12-Item Rollout Plan

This request spans data model changes, auth flows, new subsystems (referrals, OTP), and UI fixes. Shipping all 12 in a single pass would be risky for your live data. I propose splitting into **4 phases**, each independently shippable and verifiable.

Please confirm the phasing (or tell me to reorder / drop items) before I start.

---

### Phase 1 — Safe UI & form fixes (low risk, no schema change)
Ship first, verify visually, then move on.

1. **#3 Customers** — make Email + Note optional, add "(Optional)" labels.
2. **#4 Products** — make Category optional; persist + display when set.
3. **#5 Sales form** — multi-product rows (product / qty / discount / amount), empty defaults, dynamic per-row totals.
4. **#9 Add Stock form** — responsive layout, no overflow on mobile.
5. **#12 Calendar icon theming** — adapt to dark/light via `text-foreground` / semantic tokens.

### Phase 2 — Inventory ↔ Expenses + Opening Stock edit (DB + logic)
6. **#1 Restock → Expense** — DB trigger on `restocks` insert/update/delete that mirrors the cost into `expenses` with category `"Restock"`. Idempotent via `reference_id`. Flows automatically into Dashboard, Reports, cashflow (they already read `expenses`).
7. **#2 Opening Stock edit** — edit dialog on opening-stock rows; existing `handle_restock_stock_ledger` already recomputes stock on UPDATE, so past sales are untouched.

### Phase 3 — Team invite bug + permission gating (critical)
8. **#10 Team invite blank dashboard** — invited users currently get bounced because `BusinessContext` looks for a business they don't own. Fix `BusinessContext` / `ProtectedRoute` to resolve the business via `staff_members.business_owner_id`, then gate sidebar + routes by `staff_members.permissions.modules`.

### Phase 4 — Auth, phone verification, referrals (largest, needs decisions)
9. **#6 Forgot password** — email reset via Supabase (works today, just needs UI). Phone reset requires an SMS provider.
10. **#7 Phone verification in Settings** — needs SMS OTP provider.
11. **#8 Phone login** — same dependency.
12. **#11 Referral system** — new tables (`referrals`, `referral_rewards`), edge function to validate + extend `subscription_end_date` by 1 month per successful referral (cap 3), super-admin view on the existing `ReferralsPage`.

---

### Decisions I need from you before Phase 4

- **SMS provider for OTP** (#6 phone reset, #7 verify, #8 phone login): Twilio? Termii? Arkesel (popular in Ghana)? Or skip phone entirely and keep email-only?
- **Referral attribution** (#11): track by `?ref=CODE` link + signup, or also require the referred user to complete a paid annual subscription before the reward triggers? (I'd recommend the latter — otherwise it's gameable.)
- **Reward application** (#11): extend `subscription_end_date` immediately on qualifying event, or queue for super-admin approval?

---

### Suggested next step

Reply with: **"Start Phase 1"** (or pick a different starting set), and answer the Phase 4 questions whenever you're ready — I don't need them to start.

If you'd rather I just blast through everything in one go knowing some items (phone OTP, referrals) will be partial without your answers, say **"do it all"** and I'll make reasonable defaults (Arkesel for SMS, reward on paid signup, auto-apply).