ALTER TYPE public.announcement_priority ADD VALUE IF NOT EXISTS 'critical';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'lifetime';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'lifetime';