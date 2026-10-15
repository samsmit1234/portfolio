-- Nadi — QR restaurant pager
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mon restaurant',
  logo_url    text,
  owner_id    uuid not null unique references auth.users (id) on delete cascade,
  alert_sound text not null default 'chime' check (alert_sound in ('chime', 'beep', 'siren')),
  language    text not null default 'fr' check (language in ('fr', 'ar')),
  created_at  timestamptz not null default now()
);

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  number        text not null check (char_length(number) between 1 and 12),
  status        text not null default 'preparing' check (status in ('preparing', 'ready', 'done')),
  created_at    timestamptz not null default now(),
  ready_at      timestamptz
);

create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (order_id, endpoint)
);

create index if not exists push_subscriptions_order_idx on public.push_subscriptions (order_id);

-- ready_at is maintained by the database so every client agrees on it.
create or replace function public.set_ready_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') then
    new.ready_at := now();
  elsif new.status = 'preparing' then
    new.ready_at := null;
  end if;
  return new;
end $$;

drop trigger if exists orders_set_ready_at on public.orders;
create trigger orders_set_ready_at
  before update of status on public.orders
  for each row execute function public.set_ready_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.restaurants enable row level security;
alter table public.orders enable row level security;
alter table public.push_subscriptions enable row level security;

-- Staff: only their own restaurant.
drop policy if exists "owner reads restaurant" on public.restaurants;
create policy "owner reads restaurant" on public.restaurants
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "owner creates restaurant" on public.restaurants;
create policy "owner creates restaurant" on public.restaurants
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "owner updates restaurant" on public.restaurants;
create policy "owner updates restaurant" on public.restaurants
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.my_restaurant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.restaurants where owner_id = auth.uid()
$$;

drop policy if exists "staff manage orders" on public.orders;
create policy "staff manage orders" on public.orders
  for all to authenticated
  using (restaurant_id in (select public.my_restaurant_ids()))
  with check (restaurant_id in (select public.my_restaurant_ids()));

-- push_subscriptions: no client policies at all. Rows are written and read
-- only by the server (service role) — customers never touch the table directly.

-- Customers (anon) get NO table access. They read exactly one order through
-- this function, which requires the unguessable order UUID.
create or replace function public.get_public_order(p_order_id uuid)
returns table (
  id uuid,
  number text,
  status text,
  created_at timestamptz,
  ready_at timestamptz,
  restaurant_name text,
  restaurant_logo_url text,
  alert_sound text,
  language text
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.number, o.status, o.created_at, o.ready_at,
         r.name, r.logo_url, r.alert_sound, r.language
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_order_id
$$;

-- Counter-QR mode: customer scans the restaurant's fixed QR and types their
-- number. Returns the most recent open order with that number (last 24h).
create or replace function public.find_order_by_number(p_restaurant_id uuid, p_number text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select o.id from public.orders o
  where o.restaurant_id = p_restaurant_id
    and lower(o.number) = lower(trim(p_number))
    and o.status <> 'done'
    and o.created_at > now() - interval '24 hours'
  order by o.created_at desc
  limit 1
$$;

create or replace function public.get_public_restaurant(p_restaurant_id uuid)
returns table (id uuid, name text, logo_url text, language text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, r.logo_url, r.language from public.restaurants r where r.id = p_restaurant_id
$$;

revoke all on function public.get_public_order(uuid) from public;
revoke all on function public.find_order_by_number(uuid, text) from public;
revoke all on function public.get_public_restaurant(uuid) from public;
grant execute on function public.get_public_order(uuid) to anon, authenticated;
grant execute on function public.find_order_by_number(uuid, text) to anon, authenticated;
grant execute on function public.get_public_restaurant(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Staff dashboards listen to postgres_changes (RLS-filtered).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Customers listen to a private broadcast topic `order:<uuid>` that the
-- database publishes on every change of that order row. Anon may only
-- *receive* on order topics (knowing the topic requires the UUID) and can
-- never send, so the status cannot be spoofed.
create or replace function public.broadcast_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'number', new.number, 'status', new.status, 'ready_at', new.ready_at),
    'order_update',
    'order:' || new.id::text,
    true
  );
  return new;
end $$;

drop trigger if exists orders_broadcast on public.orders;
create trigger orders_broadcast
  after update on public.orders
  for each row execute function public.broadcast_order_change();

drop policy if exists "receive order broadcasts" on realtime.messages;
create policy "receive order broadcasts" on realtime.messages
  for select to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'order:%');

-- ---------------------------------------------------------------------------
-- Storage: restaurant logos (public read, owner writes into <restaurant_id>/)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "owner uploads logo" on storage.objects;
create policy "owner uploads logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select r.id::text from public.my_restaurant_ids() as r(id))
  );

drop policy if exists "owner reads logo" on storage.objects;
create policy "owner reads logo" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select r.id::text from public.my_restaurant_ids() as r(id))
  );

drop policy if exists "owner updates logo" on storage.objects;
create policy "owner updates logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select r.id::text from public.my_restaurant_ids() as r(id))
  );

-- ---------------------------------------------------------------------------
-- Cleanup (also exposed via /api/cron/cleanup for Vercel Cron)
-- ---------------------------------------------------------------------------

create or replace function public.cleanup_old_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.orders where created_at < now() - interval '24 hours';
  get diagnostics n = row_count;  -- push_subscriptions go with them (on delete cascade)
  return n;
end $$;

revoke all on function public.cleanup_old_orders() from public, anon, authenticated;
grant execute on function public.cleanup_old_orders() to service_role;

-- Optional, if pg_cron is enabled in your project (runs hourly, no Vercel needed):
-- select cron.schedule('nadi-cleanup', '0 * * * *', 'select public.cleanup_old_orders()');
