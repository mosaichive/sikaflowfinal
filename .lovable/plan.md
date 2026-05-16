
# Team Invitation & Permission System

Your project already has a working team foundation (`staff_members`, `staff_invites`, `user_roles`, `accept_staff_invite` RPC, `manage-business-user` edge function, role-aware sidebar). Rather than build a parallel `team_invitations` / `business_members` system that would conflict with existing data, this plan **extends what's there** to meet every requirement you listed.

## What changes

### 1. Permissions model
Add a structured `permissions` JSON to `staff_members` and `staff_invites`:
```json
{ "role": "manager", "modules": ["dashboard","sales","customers","orders"] }
```
Available modules: dashboard, sales, products, inventory, customers, orders, other_income, expenses, savings, reports, staff, announcements, settings.

### 2. Invite flow (link-based, no email infra yet)
- New page `/invite/:token` — public route.
- "Copy invite link" + "Send via email" buttons in Team page (email uses `mailto:` or existing Lovable email if you want — ask separately).
- Token already exists on `staff_invites`; expires in 7 days (already default 14, will tighten to 7); single-use enforced by existing `accept_staff_invite` RPC.

### 3. Invite acceptance page (`/invite/:token`)
- If **not logged in**: show Full Name + Job Title + Password fields, plus "Continue with Google". After signup/login, auto-call `accept_staff_invite(token)`.
- If **already logged in** with matching email: one-click "Join {Business}" → calls RPC → redirect to `/dashboard`.
- **Bypass onboarding**: set `profiles.onboarding_completed = true` and skip `BusinessOnboardingDialog` / business creation for invited users (detected via `staff_members.business_owner_id != user.id`).

### 4. Owner business context for staff
`BusinessContext` already loads the user's own business. Extend it: if the user is a staff member (has a row in `staff_members` where `staff_user_id = auth.uid()`), load the **owner's** business profile/products/sales instead. This is the "see business data immediately" requirement.

### 5. Permission enforcement
- `AuthContext` exposes `hasModule(module)` derived from `staff_members.permissions.modules` (owner/admin sees all).
- `AppSidebar` filters menu by `hasModule`.
- New `<RequireModule module="...">` route guard in `AppLayout` redirects unauthorized routes to `/dashboard`.
- RLS already enforces data isolation per `business_owner_id`; module gating is UI + route level.

### 6. Team management UI (`/staff` page)
Add tabs: **Members** | **Pending Invites** | **Expired**.
- Per-member: edit role + module checkboxes, suspend (set `active=false`), reactivate, remove (existing edge function).
- Per-invite: copy link, resend, revoke (delete row).
- Realtime channel on `staff_members` + `staff_invites` so changes apply without refresh.

### 7. Notifications
Insert into existing `audit_log` on invite accepted / expired / revoked. Show a bell badge in header reading recent audit entries for the owner.

## Database migration (small)
```sql
ALTER TABLE staff_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

-- Tighten accept_staff_invite to also stamp position + onboarding_completed
-- (rewrite the function; same signature)
```
No new tables. Existing `staff_members` already has `permissions jsonb` and `active` (suspend/reactivate). Existing `staff_invites` already has `token`, `status`, `expires_at`, `accepted_at`.

## Files I'll create/edit

**New**
- `src/pages/InviteAcceptPage.tsx` — `/invite/:token`
- `src/components/PermissionsEditor.tsx` — module checkbox grid
- `src/components/RequireModule.tsx` — route guard
- `src/lib/permissions.ts` — module list + helpers

**Edit**
- `src/App.tsx` — add `/invite/:token` route
- `src/context/AuthContext.tsx` — load staff membership + `hasModule`
- `src/context/BusinessContext.tsx` — resolve owner business for staff users
- `src/components/AppSidebar.tsx` — module-based filter
- `src/components/AppLayout.tsx` — wrap protected routes with `RequireModule`
- `src/components/BusinessOnboardingDialog.tsx` — skip when user is staff
- `src/pages/StaffUsersPage.tsx` — invite-by-link UI + permissions editor + tabs
- `supabase/functions/manage-business-user/index.ts` — accept `permissions.modules`, support `update_permissions` and `set_active` actions

## Scope notes
- **Email delivery**: this plan uses copy-link + mailto. If you want branded transactional emails (Lovable Email infra), say so and I'll add it after — it's a separate ~3-step setup with a domain.
- **Custom roles**: built-in roles only (owner/admin/manager/salesperson/distributor/staff). "Custom permissions per user" is achieved via the module checkboxes, not by creating new role names.
- **Decline invite**: added as "Revoke" by owner; invitee-side decline = ignore the link.

Reply **yes** to build, or tell me what to adjust (e.g. "add Lovable Email", "add Cashier role", "skip realtime").
