create table if not exists public.restocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  product_id uuid,
  product_name text not null default '',
  category text not null default '',
  quantity_added numeric not null default 0,
  cost_price_per_unit numeric not null default 0,
  total_cost numeric not null default 0,
  payment_method text not null default 'cash',
  note text,
  reference text,
  recorded_by uuid,
  recorded_by_name text,
  restock_date timestamp with time zone not null default now(),
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.restocks add column if not exists user_id uuid;
alter table public.restocks add column if not exists product_id uuid;
alter table public.restocks add column if not exists product_name text;
alter table public.restocks add column if not exists category text;
alter table public.restocks add column if not exists quantity_added numeric not null default 0;
alter table public.restocks add column if not exists cost_price_per_unit numeric not null default 0;
alter table public.restocks add column if not exists total_cost numeric not null default 0;
alter table public.restocks add column if not exists payment_method text not null default 'cash';
alter table public.restocks add column if not exists note text;
alter table public.restocks add column if not exists reference text;
alter table public.restocks add column if not exists recorded_by uuid;
alter table public.restocks add column if not exists recorded_by_name text;
alter table public.restocks add column if not exists restock_date timestamp with time zone not null default now();
alter table public.restocks add column if not exists status text not null default 'active';
alter table public.restocks add column if not exists created_at timestamp with time zone not null default now();
alter table public.restocks add column if not exists updated_at timestamp with time zone not null default now();

update public.restocks
set user_id = coalesce(user_id, recorded_by)
where user_id is null;

alter table public.restocks enable row level security;

drop policy if exists "restocks select own" on public.restocks;
drop policy if exists "restocks insert own" on public.restocks;
drop policy if exists "restocks update own" on public.restocks;
drop policy if exists "restocks delete own" on public.restocks;

create policy "restocks select own"
on public.restocks
for select
to authenticated
using (auth.uid() = user_id);

create policy "restocks insert own"
on public.restocks
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "restocks update own"
on public.restocks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "restocks delete own"
on public.restocks
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists idx_restocks_user_id on public.restocks(user_id);
create index if not exists idx_restocks_product_id on public.restocks(product_id);
create index if not exists idx_restocks_restock_date on public.restocks(restock_date desc);
create index if not exists idx_stock_movements_user_product on public.stock_movements(user_id, product_id);
create unique index if not exists idx_stock_movements_reference_reason_product
on public.stock_movements(reference_id, reason, product_id)
where reference_id is not null and reason in ('sold', 'restock');

create or replace function public.sync_product_stock(_product_id uuid, _user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric := 0;
begin
  if _product_id is null or _user_id is null then
    return 0;
  end if;

  select coalesce(sum(sm.change), 0)
    into v_stock
  from public.stock_movements sm
  where sm.product_id = _product_id
    and sm.user_id = _user_id;

  update public.products p
  set stock = v_stock,
      updated_at = now()
  where p.id = _product_id
    and p.user_id = _user_id;

  return v_stock;
end;
$$;

create or replace function public.recompute_product_stock()
returns table(product_id uuid, new_stock numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return query
  with ledger as (
    select p.id as product_id,
           coalesce(sum(sm.change), 0)::numeric as new_stock
    from public.products p
    left join public.stock_movements sm
      on sm.product_id = p.id
     and sm.user_id = p.user_id
    where p.user_id = auth.uid()
    group by p.id
  ), updated as (
    update public.products p
    set stock = ledger.new_stock,
        updated_at = now()
    from ledger
    where p.id = ledger.product_id
      and p.user_id = auth.uid()
    returning p.id, p.stock
  )
  select updated.id, updated.stock from updated;
end;
$$;

create or replace function public.handle_sale_item_stock_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'sold'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'sold'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
  end if;

  if new.product_id is not null then
    insert into public.stock_movements (
      user_id,
      product_id,
      change,
      reason,
      note,
      reference_id,
      added_by_name
    )
    values (
      new.user_id,
      new.product_id,
      -abs(coalesce(new.quantity, 0)),
      'sold',
      coalesce(nullif(new.product_name, ''), 'Sale item'),
      new.id,
      null
    )
    on conflict do nothing;

    perform public.sync_product_stock(new.product_id, new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sale_items_stock_ledger on public.sale_items;
create trigger trg_sale_items_stock_ledger
after insert or update or delete on public.sale_items
for each row
execute function public.handle_sale_item_stock_ledger();

create or replace function public.handle_restock_stock_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'restock'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason = 'restock'
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
  end if;

  if new.status <> 'cancelled' and new.product_id is not null then
    insert into public.stock_movements (
      user_id,
      product_id,
      change,
      reason,
      note,
      reference_id,
      added_by_name
    )
    values (
      new.user_id,
      new.product_id,
      abs(coalesce(new.quantity_added, 0)),
      'restock',
      coalesce(new.note, new.reference, 'Restock'),
      new.id,
      new.recorded_by_name
    )
    on conflict do nothing;

    perform public.sync_product_stock(new.product_id, new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restocks_stock_ledger on public.restocks;
create trigger trg_restocks_stock_ledger
after insert or update or delete on public.restocks
for each row
execute function public.handle_restock_stock_ledger();

drop trigger if exists update_restocks_updated_at on public.restocks;
create trigger update_restocks_updated_at
before update on public.restocks
for each row
execute function public.set_updated_at();

insert into public.stock_movements (user_id, product_id, change, reason, note, reference_id, added_by_name)
select si.user_id,
       si.product_id,
       -abs(coalesce(si.quantity, 0)),
       'sold',
       coalesce(nullif(si.product_name, ''), 'Sale item'),
       si.id,
       null
from public.sale_items si
where si.product_id is not null
  and not exists (
    select 1
    from public.stock_movements sm
    where sm.reference_id = si.id
      and sm.reason = 'sold'
      and sm.product_id = si.product_id
      and sm.user_id = si.user_id
  );

insert into public.stock_movements (user_id, product_id, change, reason, note, reference_id, added_by_name)
select r.user_id,
       r.product_id,
       abs(coalesce(r.quantity_added, 0)),
       'restock',
       coalesce(r.note, r.reference, 'Restock'),
       r.id,
       r.recorded_by_name
from public.restocks r
where r.user_id is not null
  and r.product_id is not null
  and r.status <> 'cancelled'
  and not exists (
    select 1
    from public.stock_movements sm
    where sm.reference_id = r.id
      and sm.reason = 'restock'
      and sm.product_id = r.product_id
      and sm.user_id = r.user_id
  );

with ledger as (
  select p.id as product_id,
         p.user_id,
         coalesce(sum(sm.change), 0)::numeric as new_stock
  from public.products p
  left join public.stock_movements sm
    on sm.product_id = p.id
   and sm.user_id = p.user_id
  group by p.id, p.user_id
)
update public.products p
set stock = ledger.new_stock,
    updated_at = now()
from ledger
where p.id = ledger.product_id
  and p.user_id = ledger.user_id;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'restocks'
    ) then
      alter publication supabase_realtime add table public.restocks;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'stock_movements'
    ) then
      alter publication supabase_realtime add table public.stock_movements;
    end if;
  end if;
end
$$;