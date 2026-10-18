-- 1. "Rappeler": staff can ring a ready order again. rung_at marks each ring
--    (first "Ready" included); the customer page re-rings when it changes, even
--    if the customer had muted the previous ring.
alter table public.orders add column if not exists rung_at timestamptz;

create or replace function public.set_ready_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') then
    new.ready_at := now();
    new.rung_at := now();
    new.reminder_count := 0;
    new.last_reminded_at := now();
  elsif new.status = 'preparing' then
    new.ready_at := null;
    new.rung_at := null;
    new.reminder_count := 0;
    new.last_reminded_at := null;
  end if;
  return new;
end $$;

create or replace function public.broadcast_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'number', new.number, 'status', new.status,
                       'ready_at', new.ready_at, 'rung_at', new.rung_at),
    'order_update',
    'order:' || new.id::text,
    true
  );
  return new;
end $$;

-- 2. Wait estimate for the customer page, computed from this restaurant's
--    recent orders: average preparation time (last 3 h, at least 3 orders) and
--    how many orders still in preparation were placed before this one.
create or replace function public.order_wait_estimate(p_order_id uuid)
returns table (avg_prep_seconds integer, ahead_count integer)
language sql stable security definer set search_path = '' as $$
  with o as (select * from public.orders where id = p_order_id),
  recent as (
    select extract(epoch from (x.ready_at - x.created_at)) as secs
      from public.orders x, o
     where x.restaurant_id = o.restaurant_id
       and x.ready_at is not null
       and x.ready_at > now() - interval '3 hours'
       and x.ready_at > x.created_at
     order by x.ready_at desc
     limit 30
  )
  select
    case when (select count(*) from recent) >= 3 then (select round(avg(secs))::integer from recent) end,
    (select count(*)::integer from public.orders x, o
      where x.restaurant_id = o.restaurant_id and x.status = 'preparing'
        and x.created_at < o.created_at and x.created_at > now() - interval '24 hours')
  from o
$$;

revoke all on function public.order_wait_estimate(uuid) from public;
grant execute on function public.order_wait_estimate(uuid) to anon, authenticated;

-- 3. The customer's view of an order now includes rung_at and the estimate
--    (estimate only while preparing). The return type changes, so recreate it.
drop function if exists public.get_public_order(uuid);
create function public.get_public_order(p_order_id uuid)
returns table (
  id uuid,
  number text,
  status text,
  created_at timestamptz,
  ready_at timestamptz,
  rung_at timestamptz,
  restaurant_name text,
  restaurant_logo_url text,
  alert_sound text,
  language text,
  avg_prep_seconds integer,
  ahead_count integer
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.number, o.status, o.created_at, o.ready_at, o.rung_at,
         r.name, r.logo_url, r.alert_sound, r.language,
         case when o.status = 'preparing' then w.avg_prep_seconds end,
         case when o.status = 'preparing' then w.ahead_count end
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join lateral public.order_wait_estimate(o.id) w on true
  where o.id = p_order_id
$$;

revoke all on function public.get_public_order(uuid) from public;
grant execute on function public.get_public_order(uuid) to anon, authenticated;
