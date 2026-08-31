-- KudiTrack — scheduled jobs (pg_cron + pg_net)
-- Run on the TARGET project only, AFTER the edge functions are deployed.
-- Two jobs exist in the source project (the earlier report mentioned only one).
--
-- Replace <new-ref> with the new project ref and paste the real secret values.
-- Never commit the real secrets into git; set them here at run time only.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Email campaign scheduler: fires every minute, wakes admin-email-send-campaign
--    so scheduled campaigns whose scheduled_at has passed get sent.
select cron.schedule(
  'kuditrack-email-scheduled-runner',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://<new-ref>.supabase.co/functions/v1/admin-email-send-campaign',
    headers := '{"Content-Type": "application/json", "apikey": "<NEW_ANON_KEY>"}'::jsonb,
    body := '{"action":"run_scheduled"}'::jsonb
  );
  $job$
);

-- 2) Monthly financial statements: 06:00 UTC on the 1st of each month.
--    Calls admin-monthly-statements, which builds the PDF per business and
--    emails it. Requires the STATEMENTS_CRON_SECRET value below to equal the
--    edge-function secret of the same name, otherwise the call is rejected.
select cron.schedule(
  'monthly-financial-statements',
  '0 6 1 * *',
  $job$
  select net.http_post(
    url := 'https://<new-ref>.supabase.co/functions/v1/admin-monthly-statements',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<STATEMENTS_CRON_SECRET>"}'::jsonb,
    body := '{"action":"run"}'::jsonb
  );
  $job$
);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job;
