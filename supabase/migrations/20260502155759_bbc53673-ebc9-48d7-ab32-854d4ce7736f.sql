-- =====================================
-- expenses: extra columns the UI uses
-- =====================================
alter table public.expenses
  add column if not exists description text,
  add column if not exists payment_method text default 'cash',
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists recorded_by uuid,
  add column if not exists recorded_by_name text;

-- Backfill description from legacy note column.
update public.expenses
  set description = coalesce(description, note)
  where description is null;

-- Keep description and note in sync (both are used by different code paths).
create or replace function public.sync_expenses_text_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.description is null and new.note is not null then new.description := new.note; end if;
  if new.note is null and new.description is not null then new.note := new.description; end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_expenses_text on public.expenses;
create trigger trg_sync_expenses_text
  before insert or update on public.expenses
  for each row execute function public.sync_expenses_text_columns();

-- =====================================
-- savings: extra columns the UI uses
-- =====================================
alter table public.savings
  add column if not exists source text,
  add column if not exists bank_account_id uuid,
  add column if not exists reference text,
  add column if not exists recorded_by uuid;

-- Make legacy enum "type" optional and auto-fill from source.
do $$
begin
  begin
    alter table public.savings alter column type drop not null;
  exception when others then null;
  end;
end $$;

create or replace function public.sync_savings_type_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- type is an enum (savings_type) with values like 'bank','mobile_money','susu' (best-effort match).
  if new.source is null and new.type is not null then
    new.source := new.type::text;
  end if;
  if (new.type is null) and new.source is not null then
    begin
      new.type := (new.source::public.savings_type);
    exception when others then
      -- If the source string doesn't match the enum (e.g. 'mobile_money'), default to 'bank'.
      begin
        new.type := 'bank'::public.savings_type;
      exception when others then null;
      end;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_savings_type_source on public.savings;
create trigger trg_sync_savings_type_source
  before insert or update on public.savings
  for each row execute function public.sync_savings_type_source();

-- Backfill source from existing type column.
update public.savings
  set source = coalesce(source, type::text)
  where source is null;

-- =====================================
-- stock_movements: allow update/delete by owner so restock edits/deletes work
-- =====================================
drop policy if exists "stock_movements update own" on public.stock_movements;
create policy "stock_movements update own" on public.stock_movements
  for update using (auth.uid() = user_id);

drop policy if exists "stock_movements delete own" on public.stock_movements;
create policy "stock_movements delete own" on public.stock_movements
  for delete using (auth.uid() = user_id);
