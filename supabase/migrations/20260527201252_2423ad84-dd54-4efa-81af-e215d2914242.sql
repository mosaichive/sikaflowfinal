CREATE POLICY "Staff can view their business owner profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.business_owner_id = profiles.id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
  )
);