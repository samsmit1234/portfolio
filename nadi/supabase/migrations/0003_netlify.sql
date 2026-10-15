-- Moving the app to Netlify (or any other host):
-- 1. point the reminder job at the new app URL,
-- 2. run the 24h cleanup inside Supabase (pg_cron) instead of Vercel Cron.
--
-- Replace https://YOUR-SITE.netlify.app with the app's address, then run this
-- in the Supabase SQL editor.

select cron.unschedule('nadi-reminders') where exists (select 1 from cron.job where jobname = 'nadi-reminders');
select cron.schedule(
  'nadi-reminders',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://YOUR-SITE.netlify.app/api/reminders',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )
    where exists (
      select 1 from public.orders o
       where o.status = 'ready'
         and o.reminder_count < 10
         and coalesce(o.last_reminded_at, o.ready_at) <= now() - interval '25 seconds'
         and exists (select 1 from public.push_subscriptions p where p.order_id = o.id)
    )
  $job$
);

select cron.unschedule('nadi-cleanup') where exists (select 1 from cron.job where jobname = 'nadi-cleanup');
select cron.schedule('nadi-cleanup', '0 * * * *', 'select public.cleanup_old_orders()');
