-- Stats (orders per day, average preparation time, peak hours). Orders are
-- deleted after 24 hours, so before deleting them the cleanup job folds them
-- into hourly totals per restaurant. The stats page combines those totals
-- with the orders still in the table.
create table if not exists public.order_stats_hourly (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  hour timestamptz not null,               -- start of the hour (UTC)
  orders integer not null default 0,
  prep_samples integer not null default 0, -- orders that reached "ready"
  prep_seconds bigint not null default 0,  -- sum of their preparation times
  primary key (restaurant_id, hour)
);

alter table public.order_stats_hourly enable row level security;
drop policy if exists "members read stats" on public.order_stats_hourly;
create policy "members read stats" on public.order_stats_hourly
  for select to authenticated using (restaurant_id in (select public.my_restaurant_ids()));

-- Preparation times over 3 hours are forgotten orders, not real preparations.
create or replace function public.cleanup_old_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with gone as (
    delete from public.orders where created_at < now() - interval '24 hours'
    returning restaurant_id, created_at, ready_at
  ), agg as (
    select restaurant_id,
           date_trunc('hour', created_at at time zone 'UTC') at time zone 'UTC' as hour,
           count(*)::integer as orders,
           count(*) filter (where ready_at > created_at and ready_at - created_at < interval '3 hours')::integer as samples,
           coalesce(sum(extract(epoch from ready_at - created_at))
                    filter (where ready_at > created_at and ready_at - created_at < interval '3 hours'), 0)::bigint as secs
      from gone group by 1, 2
  ), ins as (
    insert into public.order_stats_hourly as s (restaurant_id, hour, orders, prep_samples, prep_seconds)
    select restaurant_id, hour, orders, samples, secs from agg
    on conflict (restaurant_id, hour) do update
      set orders = s.orders + excluded.orders,
          prep_samples = s.prep_samples + excluded.prep_samples,
          prep_seconds = s.prep_seconds + excluded.prep_seconds
    returning 1
  )
  select count(*) into n from gone;  -- push_subscriptions go with the orders (on delete cascade)
  delete from public.order_stats_hourly where hour < now() - interval '400 days';
  delete from public.rate_limits where window_start < now() - interval '1 hour';
  delete from public.restaurant_invitations where expires_at < now() - interval '7 days';
  return n;
end $$;
