-- 1) Opening cash balance lives on the per-user profile (single-tenant schema).
alter table public.profiles
  add column if not exists opening_cash_balance numeric not null default 0;

-- 2) Mark restocks that are opening stock so they DON'T reduce Available Business Money.
alter table public.restocks
  add column if not exists is_opening_stock boolean not null default false;

-- 3) Update restock ledger trigger:
--    Use 'opening_stock' as the reason on the stock_movements row when the restock
--    is flagged as opening stock. That way the inventory page already shows it under
--    the "Opening Stock" group (it filters movement_type/reason = 'opening_stock').
create or replace function public.handle_restock_stock_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'DELETE' then
    if old.product_id is not null then
      delete from public.stock_movements
      where reference_id = old.id
        and reason in ('restock', 'opening_stock')
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
        and reason in ('restock', 'opening_stock')
        and product_id = old.product_id
        and user_id = old.user_id;

      perform public.sync_product_stock(old.product_id, old.user_id);
    end if;
  end if;

  if new.status <> 'cancelled' and new.product_id is not null then
    v_reason := case when coalesce(new.is_opening_stock, false) then 'opening_stock' else 'restock' end;

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
      v_reason,
      coalesce(new.note, new.reference, case when coalesce(new.is_opening_stock, false) then 'Opening Stock' else 'Restock' end),
      new.id,
      new.recorded_by_name
    )
    on conflict do nothing;

    perform public.sync_product_stock(new.product_id, new.user_id);
  end if;

  return new;
end;
$$;
