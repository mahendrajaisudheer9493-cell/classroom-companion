-- Classroom Companion: call POST <APP_URL>/api/tick every minute from Supabase.
-- Run in Supabase → SQL Editor. Replace <APP_URL> (e.g. https://your-app.vercel.app, no
-- trailing slash) and <CRON_SECRET> (same value as the CRON_SECRET env var in Vercel).
-- The tick sends queued messages (and, later, reminders and the digest). It also keeps the
-- free Supabase project from pausing.

-- 1. Extensions: pg_cron (scheduler) and pg_net (HTTP from Postgres).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Schedule the tick every minute. Re-running with the same name replaces the job.
select cron.schedule(
  'classroom-tick',
  '* * * * *',
  $$
  select net.http_post(
    url     := '<APP_URL>/api/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- 3. Check it's running (a new row every minute; status 'succeeded').
-- select jobid, status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'classroom-tick')
--   order by start_time desc limit 5;
-- HTTP responses from /api/tick (expect status_code 200):
-- select id, status_code, left(content, 200) as body, created from net._http_response
--   order by created desc limit 5;

-- 4. To stop it:
-- select cron.unschedule('classroom-tick');
