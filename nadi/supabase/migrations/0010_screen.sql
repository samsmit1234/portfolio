-- Dining-room TV screen (/r/<restaurant_id>/screen): order numbers being
-- prepared and ready. Public, so it exposes numbers and status only — never
-- order ids (those are the customers' private links).
create or replace function public.screen_orders(p_restaurant_id uuid)
returns table (number text, status text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.number, o.status, coalesce(o.ready_at, o.created_at)
    from public.orders o
   where o.restaurant_id = p_restaurant_id
     and o.status in ('preparing', 'ready')
     and o.created_at > now() - interval '6 hours'
   order by coalesce(o.ready_at, o.created_at)
$$;

revoke all on function public.screen_orders(uuid) from public;
grant execute on function public.screen_orders(uuid) to anon, authenticated;

-- Live updates: an empty "changed" ping on screen:<restaurant_id> for every
-- insert/update/delete; the screen then reloads through screen_orders().
create or replace function public.ping_screen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed',
                        'screen:' || coalesce(new.restaurant_id, old.restaurant_id)::text, true);
  return null;
end $$;

drop trigger if exists orders_ping_screen on public.orders;
create trigger orders_ping_screen
  after insert or update or delete on public.orders
  for each row execute function public.ping_screen();

-- Anonymous viewers may receive (never send) on order and screen topics.
drop policy if exists "receive order broadcasts" on realtime.messages;
create policy "receive order broadcasts" on realtime.messages
  for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (realtime.topic() like 'order:%' or realtime.topic() like 'screen:%')
  );
