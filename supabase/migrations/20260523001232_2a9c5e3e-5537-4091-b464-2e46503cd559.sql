-- Fix audit_log insert to prevent forging performed_by
DROP POLICY IF EXISTS "audit_log insert own" ON public.audit_log;
CREATE POLICY "audit_log insert own"
ON public.audit_log
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = user_id
  AND (performed_by IS NULL OR performed_by = auth.uid())
);

-- Remove invitee read access to staff_invites to avoid exposing the raw token.
-- The owner-side policy continues to allow business owners to read their invites.
-- Invite acceptance flows happen via owner-issued links / server-side handlers,
-- not direct table reads by the invitee.
DROP POLICY IF EXISTS "invites invitee read by email" ON public.staff_invites;