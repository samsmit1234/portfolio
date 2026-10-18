-- 1. Rate limiting (fixed window, per key such as "find:<ip>"), kept in
--    Postgres so the app needs no extra service. Only the server calls it.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security; -- no policies: server only

-- Records one hit and returns true while the key is within p_limit hits per window.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into n;
  return n <= p_limit;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Counter-QR lookup goes through the rate-limited server action only. With anon
-- access, anyone could call the RPC directly with the public key and walk the
-- sequential numbers to collect open order links.
revoke all on function public.find_order_by_number(uuid, text) from public, anon, authenticated;
grant execute on function public.find_order_by_number(uuid, text) to service_role;

-- Old rate-limit rows go away with the hourly cleanup.
create or replace function public.cleanup_old_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.orders where created_at < now() - interval '24 hours';
  get diagnostics n = row_count;  -- push_subscriptions go with them (on delete cascade)
  delete from public.rate_limits where window_start < now() - interval '1 hour';
  return n;
end $$;

-- 2. Logos: enforce size and type on the server (the 2 MB check was client-only)
--    and refuse SVG, which can carry scripts, in this public bucket.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'logos';

-- Owners may delete their own logos (the previous one is removed on replace).
drop policy if exists "owner deletes logo" on storage.objects;
create policy "owner deletes logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select r.id::text from public.my_restaurant_ids() as r(id))
  );
