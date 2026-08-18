-- ad_applications: public submissions must be pending & unreviewed
DROP POLICY IF EXISTS "Anyone can submit ad application" ON public.ad_applications;
CREATE POLICY "Anyone can submit ad application"
  ON public.ad_applications FOR INSERT
  WITH CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL);

-- feedback_messages: public submissions must be new & unresolved
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback_messages;
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback_messages FOR INSERT
  WITH CHECK (status = 'new' AND resolved_by IS NULL AND resolved_at IS NULL);

-- unsubscribes: no anonymous arbitrary inserts; authenticated users may only unsubscribe their own address
DROP POLICY IF EXISTS "Anyone can add themselves to unsubscribe list" ON public.email_marketing_unsubscribes;
REVOKE INSERT ON public.email_marketing_unsubscribes FROM anon;
CREATE POLICY "Users can unsubscribe their own email"
  ON public.email_marketing_unsubscribes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  );

-- subscription_payments: users cannot self-approve
DROP POLICY IF EXISTS "sub_payments user insert own" ON public.subscription_payments;
CREATE POLICY "sub_payments user insert own"
  ON public.subscription_payments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );