-- Allow Supabase Auth Dashboard hard deletes to complete without database
-- errors while keeping historical business records consistent.

-- Staff/recorder attribution should not block deleting an Auth account.
ALTER TABLE public.sales
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE public.expenses
  ALTER COLUMN recorded_by DROP NOT NULL;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_staff_id_fkey;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_staff_id_fkey
  FOREIGN KEY (staff_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_recorded_by_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_recorded_by_fkey
  FOREIGN KEY (recorded_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL
  NOT VALID;

-- If an owner Auth account is hard-deleted from Supabase, remove that
-- owned business and let the existing business_id cascade policies clean up
-- products, sales, inventory, finance records, and related workspace data.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_owner_user_id_fkey;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;
