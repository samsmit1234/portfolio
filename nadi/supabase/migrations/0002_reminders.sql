-- Repeat the "ready" notification every 30 s until the order is picked up
-- (max 10 reminders ≈ 5 min), like a real pager that keeps buzzing.
--
-- pg_cron ticks every 30 s inside Supabase and, only when some order is due,
-- calls the app's /api/reminders endpoint through pg_net. The endpoint claims
-- due orders atomically (claim_due_reminders) and sends the pushes, so calling
-- it extra times can never send more than one reminder per order per 25 s.
--
-- Before running: replace https://nadi-livid.vercel.app below with your app URL.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.orders add column if not exists reminder_count integer not null default 0;
alter table public.orders add column if not exists last_reminded_at timestamptz;

-- The first push goes out when staff tap "Ready"; reminders count from there.
create or replace function public.set_ready_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') then
    new.ready_at := now();
    new.reminder_count := 0;
    new.last_reminded_at := now();
  elsif new.status = 'preparing' then
    new.ready_at := null;
    new.reminder_count := 0;
    new.last_reminded_at := null;
  end if;
  return new;
end $$;

create or replace function public.claim_due_reminders()
returns table (id uuid, number text, restaurant_name text, language text)
language sql security definer set search_path = '' as $$
  update public.orders o
     set reminder_count = o.reminder_count + 1,
         last_reminded_at = now()
    from public.restaurants r
   where r.id = o.restaurant_id
     and o.status = 'ready'
     and o.reminder_count < 10
     and coalesce(o.last_reminded_at, o.ready_at) <= now() - interval '25 seconds'
     and exists (select 1 from public.push_subscriptions p where p.order_id = o.id)
  returning o.id, o.number, r.name, r.language
$$;

revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

select cron.unschedule('nadi-reminders') where exists (select 1 from cron.job where jobname = 'nadi-reminders');
select cron.schedule(
  'nadi-reminders',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://nadi-livid.vercel.app/api/reminders',
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
