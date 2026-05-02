-- Extend other_income to support category, payment method, description, attachment, and recorded-by metadata used by the UI.
alter table public.other_income
  add column if not exists category text,
  add column if not exists payment_method text,
  add column if not exists description text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists recorded_by uuid,
  add column if not exists recorded_by_name text;

-- Backfill category from legacy "source" column where missing.
update public.other_income
  set category = coalesce(category, source, 'Other')
  where category is null;

-- Backfill description from legacy note column.
update public.other_income
  set description = coalesce(description, note)
  where description is null and note is not null;

-- Make legacy "source" optional so new inserts that only provide category continue to work.
alter table public.other_income alter column source drop not null;
alter table public.other_income alter column source set default '';

-- Keep source in sync with category automatically so historical reports keep working.
create or replace function public.sync_other_income_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source is null or new.source = '' then
    new.source := coalesce(new.category, 'Other');
  end if;
  if new.category is null or new.category = '' then
    new.category := coalesce(new.source, 'Other');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_other_income_source on public.other_income;
create trigger trg_sync_other_income_source
  before insert or update on public.other_income
  for each row execute function public.sync_other_income_source();

-- Storage bucket for other income receipts (private).
insert into storage.buckets (id, name, public)
values ('other-income-receipts', 'other-income-receipts', false)
on conflict (id) do nothing;

-- Storage policies: users can read/write only their own folder (folder name = auth.uid()).
drop policy if exists "other_income_receipts_select_own" on storage.objects;
create policy "other_income_receipts_select_own"
  on storage.objects for select
  using (bucket_id = 'other-income-receipts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "other_income_receipts_insert_own" on storage.objects;
create policy "other_income_receipts_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'other-income-receipts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "other_income_receipts_update_own" on storage.objects;
create policy "other_income_receipts_update_own"
  on storage.objects for update
  using (bucket_id = 'other-income-receipts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "other_income_receipts_delete_own" on storage.objects;
create policy "other_income_receipts_delete_own"
  on storage.objects for delete
  using (bucket_id = 'other-income-receipts' and auth.uid()::text = (storage.foldername(name))[1]);
