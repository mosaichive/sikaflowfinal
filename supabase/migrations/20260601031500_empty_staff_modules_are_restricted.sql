CREATE OR REPLACE FUNCTION public.staff_member_has_module(_owner_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.business_owner_id = _owner_id
      AND sm.staff_user_id = auth.uid()
      AND sm.active = true
      AND (
        sm.permissions ->> 'role' = 'admin'
        OR (
          jsonb_typeof(sm.permissions -> 'modules') = 'array'
          AND (sm.permissions -> 'modules') ? _module
        )
        OR (
          jsonb_typeof(sm.permissions -> 'modules') IS DISTINCT FROM 'array'
          AND (
            (_module = 'dashboard')
            OR (sm.permissions ->> 'role' = 'manager' AND _module = ANY (ARRAY['sales','products','inventory','customers','orders','other_income','expenses','savings','reports','announcements']))
            OR (sm.permissions ->> 'role' = 'salesperson' AND _module = ANY (ARRAY['sales','customers','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'cashier' AND _module = ANY (ARRAY['sales','customers','announcements']))
            OR (sm.permissions ->> 'role' = 'distributor' AND _module = ANY (ARRAY['inventory','orders','announcements']))
            OR (sm.permissions ->> 'role' = 'staff' AND _module = 'announcements')
          )
        )
      )
  );
$$;
