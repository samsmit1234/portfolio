-- One open order per number and restaurant. The dashboard checks this too, but
-- only locally: two staff devices could create the same number at once, and
-- find_order_by_number would then send a customer to the wrong order.

-- Existing duplicates would block the index: keep the newest open order of
-- each number (the one find_order_by_number already returns) and close the rest.
update public.orders o
   set status = 'done'
 where o.status <> 'done'
   and exists (
     select 1 from public.orders n
      where n.restaurant_id = o.restaurant_id
        and lower(n.number) = lower(o.number)
        and n.status <> 'done'
        and (n.created_at, n.id) > (o.created_at, o.id)
   );

create unique index if not exists orders_open_number_uniq
  on public.orders (restaurant_id, lower(number))
  where status <> 'done';
