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

-- 8. Schema-object inventory (added by verification pass)
select 'db.tables='||count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
select 'db.enums='||count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e';
select 'db.enum.'||t.typname||'='||count(e.enumlabel) from pg_type t join pg_namespace n on n.oid=t.typnamespace
  join pg_enum e on e.enumtypid=t.oid where n.nspname='public' and t.typtype='e' group by t.typname order by 1;
select 'db.pk='||count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='p';
select 'db.fk='||count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='f';
select 'db.unique='||count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='u';
select 'db.check='||count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and c.contype='c';
select 'db.sequences='||count(*) from information_schema.sequences where sequence_schema='public';
select 'db.identity_columns='||count(*) from information_schema.columns where table_schema='public' and (is_identity='YES' or column_default like 'nextval%');
select 'db.security_definer_functions='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;

-- 9. GRANTS (must be non-zero or PostgREST returns permission errors)
select 'grant.'||g.ge||'='||count(*) from (
  select pg_get_userbyid(a.grantee) ge from pg_class c
  join pg_namespace n on n.oid=c.relnamespace, aclexplode(coalesce(c.relacl,'{}')) a
  where n.nspname='public' and c.relkind='r') g
where g.ge in ('anon','authenticated','service_role') group by g.ge order by 1;

-- 10. Extensions and scheduled jobs
select 'ext.'||extname||'=1' from pg_extension where extname in ('pgcrypto','uuid-ossp','pg_cron','pg_net') order by 1;
-- pg_cron may legitimately be absent when this runs (target, before 07_cron.sql),
-- so probe it dynamically instead of failing the whole fingerprint.
create or replace function pg_temp.cron_fingerprint() returns setof text language plpgsql as $fn$
begin
  if to_regclass('cron.job') is null then
    return next 'cron.jobs=0';
    return;
  end if;
  return query execute $q$ select 'cron.jobs='||count(*)::text from cron.job $q$;
  return query execute $q$ select 'cron.job.'||jobname||'='||schedule from cron.job order by 1 $q$;
end
$fn$;
select * from pg_temp.cron_fingerprint();

-- 11. Additional ownership / orphan checks (all must be 0)
select 'orphan.expenses_without_profile='||count(*) from public.expenses e left join public.profiles p on p.id=e.user_id where p.id is null;
select 'orphan.other_income_without_profile='||count(*) from public.other_income o left join public.profiles p on p.id=o.user_id where p.id is null;
select 'orphan.savings_without_profile='||count(*) from public.savings s left join public.profiles p on p.id=s.user_id where p.id is null;
select 'orphan.restocks_without_profile='||count(*) from public.restocks r left join public.profiles p on p.id=r.user_id where p.id is null;
select 'orphan.stock_movements_without_product='||count(*) from public.stock_movements m left join public.products pr on pr.id=m.product_id where pr.id is null;
select 'orphan.customers_without_profile='||count(*) from public.customers c left join public.profiles p on p.id=c.user_id where p.id is null;
select 'orphan.sale_documents_without_sale='||count(*) from public.sale_documents d left join public.sales s on s.id=d.sale_id where s.id is null;
select 'orphan.audit_log_without_user='||count(*) from public.audit_log a left join auth.users u on u.id=a.user_id where u.id is null;
select 'orphan.storage_objects_without_bucket='||count(*) from storage.objects o left join storage.buckets b on b.id=o.bucket_id where b.id is null;
select 'orphan.identities_without_user='||count(*) from auth.identities i left join auth.users u on u.id=i.user_id where u.id is null;

-- 12. Identity / UUID preservation fingerprints (must be byte-identical source vs target)
select 'md5.auth_user_ids='||md5(string_agg(id::text,',' order by id)) from auth.users;
select 'md5.identities='||md5(string_agg(provider||':'||provider_id||':'||user_id::text,',' order by provider, provider_id)) from auth.identities;
select 'count.auth_identities_google='||count(*) from auth.identities where provider='google';
select 'count.auth_identities_email='||count(*) from auth.identities where provider='email';
select 'md5.profile_ids='||md5(string_agg(id::text,',' order by id)) from public.profiles;
select 'md5.product_ids='||md5(string_agg(id::text,',' order by id)) from public.products;
select 'md5.sale_ids='||md5(string_agg(id::text,',' order by id)) from public.sales;
select 'md5.sale_created_at='||md5(string_agg(id::text||'@'||created_at::text,',' order by id)) from public.sales;
select 'md5.storage_paths='||md5(string_agg(bucket_id||'/'||name,',' order by bucket_id, name)) from storage.objects;
select 'md5.bucket_config='||md5(string_agg(id||':'||public::text||':'||coalesce(file_size_limit::text,'-'),',' order by id)) from storage.buckets;

-- 13. RLS behaviour: every public table must have RLS on AND at least one policy
select 'rls.tables_without_rls='||count(*) from pg_tables where schemaname='public' and not rowsecurity;
select 'rls.tables_without_policy='||count(*) from pg_tables t where t.schemaname='public'
  and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename);
select 'realtime.tables='||count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';
