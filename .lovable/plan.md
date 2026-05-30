# KudiTrack Marketing Site

A new public marketing site, fully isolated from the existing app/dashboard. No changes to existing auth, business data, or financial logic.

## 1. Routing

- `/` → `MarketingLayout` + `HomePage` (single long-scroll page with all sections, anchor links for `#features`, `#pricing`, `#reviews`, `#advertise`, `#contact`, `#faq`).
- Authenticated users hitting `/` still go to `/dashboard` (preserve current behavior via a small guard inside `HomePage`, redirecting if `user` exists).
- Dedicated routes also exist and reuse the same layout, each rendering a focused section + the rest below:
  - `/features`, `/pricing`, `/reviews`, `/advertise`, `/contact`, `/feedback`
- All marketing routes wrapped in `<MarketingLayout>` (sticky transparent navbar + footer). The existing AuthProvider/Subscription stack still wraps everything so navbar can show "Dashboard" when logged in.

## 2. Design system (scoped, no impact on dashboard)

- Dark fintech aesthetic: deep navy/black backgrounds with violet→cyan→emerald gradient accents.
- Glassmorphism cards, animated gradient blobs, soft glows, subtle grid backdrop.
- Framer Motion (already installed) for scroll reveals, parallax, counters, hero carousel.
- Mobile-first responsive.
- Add a scoped CSS class layer (`.marketing-*`) so the dashboard's tokens stay untouched.

## 3. Sections (all on `/`)

1. **Sticky transparent Navbar** — Logo · Features · Pricing · Reviews · Advertise · Contact · Login · Get Started.
2. **Hero** — Headline, sub, two CTAs, auto-rotating 3-slide showcase (Sales / Inventory / Analytics), floating glassy stat cards (Daily Sales, Profit, Low Stock), animated gradient blobs, animated counters.
3. **Features** — 9 cards w/ icons, hover lift, gradient borders, scroll-reveal stagger.
4. **Problem → Solution** — Split screen, "messy notebooks" vs organized dashboard, animated transition.
5. **Dashboard Showcase** — Big floating mock dashboard panel, glowing floating KPI cards.
6. **Reviews** — Auto-scrolling testimonial carousel, glass cards, star ratings.
7. **Advertise** — Benefits grid + application form.
8. **Pricing** — Free / Basic / Pro, monthly/yearly toggle, glowing recommended plan.
9. **FAQ** — Animated accordion (reuse shadcn Accordion).
10. **CTA** — Cinematic gradient band, big buttons.
11. **Feedback / Contact** — Form (name, email, subject, message).
12. **Footer** — Logo, links, socials, legal.

## 4. Backend (new, isolated)

Two new tables, both with RLS:

- `public.feedback_messages` — `id, name, email, subject, message, status (new|in_progress|resolved), created_at, resolved_at`.
  - Anyone (anon + authenticated) can `INSERT`.
  - Only `super_admin` can `SELECT/UPDATE/DELETE`.
- `public.ad_applications` — `id, business_name, contact_name, email, phone, business_type, ad_goal, budget, message, status (pending|approved|rejected|contacted), created_at, reviewed_at, reviewed_by`.
  - Anyone (anon + authenticated) can `INSERT`.
  - Only `super_admin` can read/update/delete.

Both submitted from the public landing page without auth.

## 5. Super Admin additions

Two new pages under `/super-admin`:

- `/super-admin/feedback` — list, filter by status, mark resolved, delete. Realtime via Supabase channel, unread badge in `PlatformLayout` sidebar.
- `/super-admin/ad-applications` — list, filter, approve/reject/mark contacted, copy contact info.

Sidebar links added to `PlatformLayout` with unread-count badges.

## 6. What I will NOT touch

- `src/pages/Dashboard.tsx` and all tenant pages.
- Auth flows, business/subscription contexts.
- Existing tables, RLS policies, edge functions, financial calcs.
- The Supabase client/types files.

## Technical notes

- New components live under `src/components/marketing/` and `src/pages/marketing/`.
- Hero carousel uses existing embla carousel + autoplay via simple interval.
- Counters use the existing `AnimatedNumber` component.
- Form submissions use the existing Supabase client (`supabase.from('feedback_messages').insert(...)`) — works for anon thanks to the INSERT-only policy.
- No new npm dependencies needed (framer-motion, embla, lucide, shadcn ui all present).

If this matches what you want, I'll run the migration first (you'll approve it), then build the page and super-admin views.
