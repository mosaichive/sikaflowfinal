-- =====================================
-- bank_accounts (used by Settings + Savings page)
-- =====================================
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  branch text default '',
  mobile_money_name text default '',
  mobile_money_number text default '',
  account_type text not null default 'bank',
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts select own" on public.bank_accounts;
create policy "bank_accounts select own" on public.bank_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "bank_accounts insert own" on public.bank_accounts;
create policy "bank_accounts insert own" on public.bank_accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "bank_accounts update own" on public.bank_accounts;
create policy "bank_accounts update own" on public.bank_accounts
  for update using (auth.uid() = user_id);

drop policy if exists "bank_accounts delete own" on public.bank_accounts;
create policy "bank_accounts delete own" on public.bank_accounts
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_bank_accounts_updated on public.bank_accounts;
create trigger trg_bank_accounts_updated
  before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- =====================================
-- audit_log (used by Settings)
-- =====================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  details text,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

drop policy if exists "audit_log select own" on public.audit_log;
create policy "audit_log select own" on public.audit_log
  for select using (auth.uid() = user_id);

drop policy if exists "audit_log insert own" on public.audit_log;
create policy "audit_log insert own" on public.audit_log
  for insert with check (auth.uid() = user_id);

-- =====================================
-- investments (money taken OUT for non-business investments)
-- =====================================
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default '',
  amount numeric not null default 0,
  investment_date timestamptz not null default now(),
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.investments enable row level security;

drop policy if exists "investments select own" on public.investments;
create policy "investments select own" on public.investments
  for select using (auth.uid() = user_id);
drop policy if exists "investments insert own" on public.investments;
create policy "investments insert own" on public.investments
  for insert with check (auth.uid() = user_id);
drop policy if exists "investments update own" on public.investments;
create policy "investments update own" on public.investments
  for update using (auth.uid() = user_id);
drop policy if exists "investments delete own" on public.investments;
create policy "investments delete own" on public.investments
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_investments_updated on public.investments;
create trigger trg_investments_updated
  before update on public.investments
  for each row execute function public.set_updated_at();

-- =====================================
-- investor_funding (money put INTO the business by investors)
-- =====================================
create table if not exists public.investor_funding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  investor_name text not null default '',
  amount numeric not null default 0,
  date_received timestamptz not null default now(),
  reference text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.investor_funding enable row level security;

drop policy if exists "investor_funding select own" on public.investor_funding;
create policy "investor_funding select own" on public.investor_funding
  for select using (auth.uid() = user_id);
drop policy if exists "investor_funding insert own" on public.investor_funding;
create policy "investor_funding insert own" on public.investor_funding
  for insert with check (auth.uid() = user_id);
drop policy if exists "investor_funding update own" on public.investor_funding;
create policy "investor_funding update own" on public.investor_funding
  for update using (auth.uid() = user_id);
drop policy if exists "investor_funding delete own" on public.investor_funding;
create policy "investor_funding delete own" on public.investor_funding
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_investor_funding_updated on public.investor_funding;
create trigger trg_investor_funding_updated
  before update on public.investor_funding
  for each row execute function public.set_updated_at();
