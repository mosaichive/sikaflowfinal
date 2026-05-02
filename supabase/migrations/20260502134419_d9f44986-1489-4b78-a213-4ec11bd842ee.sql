-- Wipe all tenant data and auth users for a fresh start. Schema, RLS, triggers, and migrations are preserved.
DO $$
DECLARE
  tables_to_reset text[] := ARRAY[
    'public.stock_movements',
    'public.sale_items',
    'public.sales',
    'public.expenses',
    'public.other_income',
    'public.savings',
    'public.customers',
    'public.products',
    'public.staff_invites',
    'public.staff_members',
    'public.subscription_payments',
    'public.announcements',
    'public.user_roles',
    'public.profiles'
  ];
  existing_tables text;
BEGIN
  SELECT string_agg(table_name, ', ')
    INTO existing_tables
    FROM unnest(tables_to_reset) AS table_name
    WHERE to_regclass(table_name) IS NOT NULL;

  IF existing_tables IS NOT NULL AND existing_tables <> '' THEN
    EXECUTE 'TRUNCATE TABLE ' || existing_tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Remove all auth users so the next sign-up starts truly fresh.
DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.one_time_tokens;
DELETE FROM auth.mfa_factors;
DELETE FROM auth.mfa_challenges;
DELETE FROM auth.users;
