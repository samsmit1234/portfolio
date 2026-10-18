-- Order numbering: optional prefix (e.g. "A-"), zero padding (A-001), and a
-- daily restart at 1, counted in the restaurant's time zone.
alter table public.restaurants
  add column if not exists number_prefix text not null default '',
  add column if not exists number_digits integer not null default 0,
  add column if not exists daily_reset boolean not null default true,
  add column if not exists timezone text not null default 'Africa/Casablanca';

alter table public.restaurants drop constraint if exists restaurants_number_prefix_check;
alter table public.restaurants add constraint restaurants_number_prefix_check
  check (number_prefix ~ '^[A-Za-z0-9-]{0,4}$');
alter table public.restaurants drop constraint if exists restaurants_number_digits_check;
alter table public.restaurants add constraint restaurants_number_digits_check
  check (number_digits between 0 and 4);

-- Counter lookup: also match when the customer types only the digits
-- ("1" or "001" finds "A-001").
create or replace function public.find_order_by_number(p_restaurant_id uuid, p_number text)
returns uuid
language sql stable security definer set search_path = '' as $$
  with q as (select lower(trim(p_number)) as n)
  select o.id from public.orders o, q
  where o.restaurant_id = p_restaurant_id
    and o.status <> 'done'
    and o.created_at > now() - interval '24 hours'
    and (
      lower(o.number) = q.n
      or (q.n ~ '^[0-9]+$'
          and nullif(ltrim(regexp_replace(o.number, '[^0-9]', '', 'g'), '0'), '') = nullif(ltrim(q.n, '0'), ''))
    )
  order by (lower(o.number) = q.n) desc, o.created_at desc
  limit 1
$$;
