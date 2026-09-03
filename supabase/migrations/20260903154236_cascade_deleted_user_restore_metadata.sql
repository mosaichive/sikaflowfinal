-- Keep restore bookkeeping attached to its Auth user and business so future
-- account deletion cannot leave private restore metadata behind. NOT VALID
-- preserves existing legacy/orphan rows while enforcing the relationship for
-- new rows and applying the cascade when a referenced row is deleted.

ALTER TABLE public.restore_record_map
  DROP CONSTRAINT IF EXISTS restore_record_map_user_id_fkey;

ALTER TABLE public.restore_record_map
  ADD CONSTRAINT restore_record_map_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.restore_logs
  DROP CONSTRAINT IF EXISTS restore_logs_user_id_fkey;

ALTER TABLE public.restore_logs
  ADD CONSTRAINT restore_logs_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.restore_logs
  DROP CONSTRAINT IF EXISTS restore_logs_business_id_fkey;

ALTER TABLE public.restore_logs
  ADD CONSTRAINT restore_logs_business_id_fkey
  FOREIGN KEY (business_id)
  REFERENCES public.businesses(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_user_id_fkey;

ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;
