
-- 1. staff_invites: add WITH CHECK so invitee can only accept (set accepted_user_id/accepted_at/status='accepted')
DROP POLICY IF EXISTS "invites invitee accept" ON public.staff_invites;
CREATE POLICY "invites invitee accept"
ON public.staff_invites
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  AND status = 'pending'
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  AND status IN ('accepted','declined')
  AND accepted_user_id = auth.uid()
);

-- 2. profiles: prevent self privilege escalation on subscription/suspension fields via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date THEN
    RAISE EXCEPTION 'Not authorized to modify subscription or suspension fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privileged_updates ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privileged_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privileged_updates();

-- 3. support_messages: enforce user_id = auth.uid()
DROP POLICY IF EXISTS "support messages user insert" ON public.support_messages;
CREATE POLICY "support messages user insert"
ON public.support_messages
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 4. realtime.messages: restrict channel subscriptions to user-scoped topics
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  OR realtime.topic() = ('user:' || auth.uid()::text)
);

DROP POLICY IF EXISTS "Authenticated users can broadcast to own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  OR realtime.topic() = ('user:' || auth.uid()::text)
);
