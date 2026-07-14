
CREATE POLICY "Super admins read email-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'email-media' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins upload email-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'email-media' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins update email-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'email-media' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins delete email-media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'email-media' AND public.has_role(auth.uid(), 'super_admin'));
