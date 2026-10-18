-- Several staff accounts per restaurant.
-- restaurant_members links users to a restaurant as 'owner' or 'staff'. Staff
-- run the order board; only owners change settings, the logo and the team.
-- People join through one-time invitation links (48 h) created by the owner.

create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null check (role in ('owner', 'staff')),
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index if not exists restaurant_members_user_idx on public.restaurant_members (user_id);

-- Existing owners become members; new restaurants add their owner automatically.
insert into public.restaurant_members (restaurant_id, user_id, role)
select id, owner_id, 'owner' from public.restaurants
on conflict do nothing;

create or replace function public.add_owner_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists restaurants_owner_membership on public.restaurants;
create trigger restaurants_owner_membership
  after insert on public.restaurants
  for each row execute function public.add_owner_membership();

-- Restaurants the current user works at (any role) / owns.
create or replace function public.my_restaurant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select restaurant_id from public.restaurant_members where user_id = auth.uid()
$$;

create or replace function public.my_owned_restaurant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select restaurant_id from public.restaurant_members where user_id = auth.uid() and role = 'owner'
$$;

-- Restaurants: members read, owners update. (Orders keep "staff manage orders",
-- which already uses my_restaurant_ids() and so now covers staff too.)
drop policy if exists "owner reads restaurant" on public.restaurants;
drop policy if exists "members read restaurant" on public.restaurants;
create policy "members read restaurant" on public.restaurants
  for select to authenticated using (id in (select public.my_restaurant_ids()));

drop policy if exists "owner updates restaurant" on public.restaurants;
create policy "owner updates restaurant" on public.restaurants
  for update to authenticated
  using (id in (select public.my_owned_restaurant_ids()))
  with check (id in (select public.my_owned_restaurant_ids()));

-- Logos: owners only.
drop policy if exists "owner uploads logo" on storage.objects;
create policy "owner uploads logo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] in (select r.id::text from public.my_owned_restaurant_ids() as r(id)));
drop policy if exists "owner reads logo" on storage.objects;
create policy "owner reads logo" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select r.id::text from public.my_owned_restaurant_ids() as r(id)));
drop policy if exists "owner updates logo" on storage.objects;
create policy "owner updates logo" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select r.id::text from public.my_owned_restaurant_ids() as r(id)));
drop policy if exists "owner deletes logo" on storage.objects;
create policy "owner deletes logo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] in (select r.id::text from public.my_owned_restaurant_ids() as r(id)));

-- Members table: colleagues can see each other; changes go through the functions below.
alter table public.restaurant_members enable row level security;
drop policy if exists "members see team" on public.restaurant_members;
create policy "members see team" on public.restaurant_members
  for select to authenticated using (restaurant_id in (select public.my_restaurant_ids()));

-- Invitations: only the SHA-256 of the token is stored; the link is shown once.
create table if not exists public.restaurant_invitations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  token_hash    text not null unique,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '48 hours',
  used_by       uuid references auth.users (id) on delete set null,
  used_at       timestamptz
);
alter table public.restaurant_invitations enable row level security;
drop policy if exists "owners see invitations" on public.restaurant_invitations;
create policy "owners see invitations" on public.restaurant_invitations
  for select to authenticated using (restaurant_id in (select public.my_owned_restaurant_ids()));
drop policy if exists "owners revoke invitations" on public.restaurant_invitations;
create policy "owners revoke invitations" on public.restaurant_invitations
  for delete to authenticated using (restaurant_id in (select public.my_owned_restaurant_ids()));

-- Owner: create a one-time staff invitation. Returns the token (shown once).
create or replace function public.create_staff_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  select restaurant_id into rid from public.restaurant_members
   where user_id = auth.uid() and role = 'owner'
   order by created_at limit 1;
  if rid is null then raise exception 'not_owner' using errcode = '42501'; end if;
  insert into public.restaurant_invitations (restaurant_id, token_hash, created_by)
  values (rid, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  return token;
end $$;

-- Signed-in user: join the restaurant of a valid, unused, unexpired invitation.
-- Returns the restaurant id, or raises 'invalid_invitation'.
create or replace function public.accept_staff_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.restaurant_invitations;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into inv from public.restaurant_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if inv.id is null then raise exception 'invalid_invitation' using errcode = 'P0002'; end if;
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (inv.restaurant_id, auth.uid(), 'staff')
  on conflict do nothing;
  update public.restaurant_invitations set used_at = now(), used_by = auth.uid() where id = inv.id;
  return inv.restaurant_id;
end $$;

-- Signed-in user: which restaurant a still-valid invitation is for (join page).
create or replace function public.invitation_info(p_token text)
returns table (restaurant_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.name, i.expires_at
    from public.restaurant_invitations i
    join public.restaurants r on r.id = i.restaurant_id
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.used_at is null and i.expires_at > now()
$$;

-- Owner: the team with emails (auth.users is not readable by clients).
create or replace function public.restaurant_team()
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at
    from public.restaurant_members m
    join auth.users u on u.id = m.user_id
   where m.restaurant_id in (select public.my_owned_restaurant_ids())
   order by m.role desc, m.created_at
$$;

-- Owner: remove a staff member (never an owner).
create or replace function public.remove_staff_member(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.restaurant_members
   where user_id = p_user_id and role = 'staff'
     and restaurant_id in (select public.my_owned_restaurant_ids())
$$;

revoke all on function public.create_staff_invitation() from public, anon;
revoke all on function public.accept_staff_invitation(text) from public, anon;
revoke all on function public.restaurant_team() from public, anon;
revoke all on function public.invitation_info(text) from public, anon;
revoke all on function public.remove_staff_member(uuid) from public, anon;
grant execute on function public.create_staff_invitation() to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;
grant execute on function public.restaurant_team() to authenticated;
grant execute on function public.invitation_info(text) to authenticated;
grant execute on function public.remove_staff_member(uuid) to authenticated;

-- Old invitations go with the hourly cleanup.
create or replace function public.cleanup_old_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.orders where created_at < now() - interval '24 hours';
  get diagnostics n = row_count;  -- push_subscriptions go with them (on delete cascade)
  delete from public.rate_limits where window_start < now() - interval '1 hour';
  delete from public.restaurant_invitations where expires_at < now() - interval '7 days';
  return n;
end $$;
