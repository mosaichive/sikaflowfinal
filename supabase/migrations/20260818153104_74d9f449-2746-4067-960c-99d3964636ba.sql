ALTER TABLE public.email_campaigns ALTER COLUMN from_email SET DEFAULT 'news@mail.kuditrack.online';
UPDATE public.email_campaigns SET from_email = 'news@mail.kuditrack.online' WHERE from_email LIKE '%@kuditrack.online' AND status IN ('draft','scheduled');
ALTER TABLE public.statement_settings ALTER COLUMN from_email SET DEFAULT 'statements@mail.kuditrack.online';
UPDATE public.statement_settings SET from_email = 'statements@mail.kuditrack.online' WHERE from_email LIKE '%@kuditrack.online';