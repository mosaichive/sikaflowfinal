-- KudiTrack migration validation fingerprint.
-- Run identically on SOURCE (before cutover) and TARGET (after import).
-- Output is a stable "table=count" list plus financial/integrity checksums.
-- READ-ONLY. Safe on production.

\pset tuples_only on
\pset format unaligned

-- 1. Row counts per public table
select 'count.'||table_name||'='||(
  xpath('/row/c/text()',
        query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, ''))
)[1]::text
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by table_name;

-- 2. Auth identity counts (run with a role that can read auth)
select 'count.auth_users='||count(*) from auth.users;
select 'count.auth_identities='||count(*) from auth.identities;
select 'count.auth_users_with_password='||count(*) from auth.users where encrypted_password is not null and encrypted_password <> '';

-- 3. Storage
select 'count.storage_buckets='||count(*) from storage.buckets;
select 'count.storage_objects='||count(*) from storage.objects;
select 'storage.bucket.'||bucket_id||'='||count(*) from storage.objects group by bucket_id order by 1;

-- 4. Financial checksums (must match to the cent)
select 'sum.sales_total='||coalesce(sum(total),0)::text from public.sales;
select 'sum.sales_amount_paid='||coalesce(sum(amount_paid),0)::text from public.sales;
select 'sum.sale_items_line_total='||coalesce(sum(line_total),0)::text from public.sale_items;
select 'sum.expenses_amount='||coalesce(sum(amount),0)::text from public.expenses;
select 'sum.other_income_amount='||coalesce(sum(amount),0)::text from public.other_income;
select 'sum.savings_amount='||coalesce(sum(amount),0)::text from public.savings;
select 'sum.restocks_total_cost='||coalesce(sum(total_cost),0)::text from public.restocks;
select 'sum.orders_total='||coalesce(sum(total),0)::text from public.orders;
select 'sum.subscription_payments_amount='||coalesce(sum(amount),0)::text from public.subscription_payments;

-- 5. Inventory integrity
select 'sum.products_stock='||coalesce(sum(stock),0)::text from public.products;
select 'sum.stock_movements_change='||coalesce(sum(change),0)::text from public.stock_movements;

-- 6. Ownership / relationship integrity (all must be 0)
select 'orphan.products_without_profile='||count(*) from public.products p
  left join public.profiles pr on pr.id=p.user_id where pr.id is null;
select 'orphan.sales_without_profile='||count(*) from public.sales s
  left join public.profiles pr on pr.id=s.user_id where pr.id is null;
select 'orphan.sale_items_without_sale='||count(*) from public.sale_items si
  left join public.sales s on s.id=si.sale_id where s.id is null;
select 'orphan.order_items_without_order='||count(*) from public.order_items oi
  left join public.orders o on o.id=oi.order_id where o.id is null;
select 'orphan.profiles_without_auth_user='||count(*) from public.profiles pr
  left join auth.users u on u.id=pr.id where u.id is null;
select 'orphan.user_roles_without_auth_user='||count(*) from public.user_roles ur
  left join auth.users u on u.id=ur.user_id where u.id is null;
select 'orphan.staff_members_without_owner='||count(*) from public.staff_members sm
  left join public.profiles pr on pr.id=sm.business_owner_id where pr.id is null;

-- 7. Security surface (counts must match source)
select 'rls.tables_with_rls='||count(*) from pg_tables where schemaname='public' and rowsecurity;
select 'rls.policies='||count(*) from pg_policies where schemaname='public';
select 'rls.storage_policies='||count(*) from pg_policies where schemaname='storage';
select 'db.functions='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'db.triggers='||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;
select 'db.indexes='||count(*) from pg_indexes where schemaname='public';
select 'db.realtime_tables='||count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';
