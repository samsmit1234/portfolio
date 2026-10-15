# Nadi — QR restaurant pager

**Nadi** (نادِ, "call out") replaces plastic restaurant pagers with a QR code. The customer
scans it and keeps the page open. When the order is ready, the phone rings, vibrates and
flashes, and it also gets a Web Push notification if the browser supports it. No app, no SMS, no WhatsApp.

Next.js (App Router) · TypeScript · Supabase (Postgres, Realtime, Auth, Storage) · Web Push (VAPID) · installable PWA · Vercel.

## How it works

| Step | Who | What happens |
| --- | --- | --- |
| 1 | Staff | `/dashboard` → type a number → **Create** → a QR to `/o/{orderId}` opens (printable). Alternatively, print the **counter QR** once (`/r/{restaurantId}`) and customers type their number. |
| 2 | Customer | Scans → `/o/{orderId}` shows the number and the status **Preparing** (French / Arabic RTL toggle). |
| 3 | Customer | Taps **Enable alert**, one gesture that unlocks Web Audio, requests a Screen Wake Lock, asks for notification permission, registers `/sw.js`, subscribes with `PushManager` and saves the subscription (`POST /api/orders/{id}/subscribe`). |
| 4 | Customer page | Listens on the private Realtime broadcast topic `order:{id}`, which a DB trigger publishes on every change to the order row. It also polls every 15 s and on `visibilitychange`/`online`. |
| 5 | Staff | **Ready** → `POST /api/orders/{id}/status` updates the row through RLS, then `web-push` notifies every subscription of that order. A 404/410 response deletes the subscription. |
| 6 | Customer | Page open: a looping alarm, vibration, and a full-screen flashing "Your order is ready". Page closed: the service worker shows a notification, and tapping it opens or focuses the page. |
| 7 | Staff | **Picked up** → status `done`: the alarm stops and the order's push subscriptions are deleted. |

## Setup

1. **Supabase project**: in the SQL editor, run `supabase/migrations/0001_init.sql`.
   It creates the tables, RLS, public RPCs, the Realtime trigger and policy, the `logos` storage bucket and the cleanup function.
   - Auth → Providers: Email enabled. Turn off "Confirm email" if you want staff to log in right after signing up.
2. **VAPID keys**: run `npm run vapid`.
3. **Env vars**: copy `.env.example` → `.env.local` and fill it in. Use the same variables on Vercel.
4. `npm install && npm run dev` → http://localhost:3000/login (creating an account creates the restaurant).
5. **Deploy on Vercel**: import the repo and set **Root Directory = `nadi`**. Set `CRON_SECRET`.
   `vercel.json` runs `/api/cron/cleanup` daily, the most often Vercel Hobby allows. For hourly cleanup, enable
   `pg_cron` in Supabase and uncomment the `cron.schedule` line at the end of the migration.

Web Push needs HTTPS. `localhost` works for development.

## Security model

- **Staff**: RLS on `restaurants` and `orders` allows rows of the restaurant whose `owner_id = auth.uid()` only.
- **Customers** have no direct table access. They read a single order through the `get_public_order(uuid)` RPC
  (security definer), so they need the unguessable UUID.
- **Realtime**: customers can only *receive* broadcasts on `order:*` topics. They need the UUID to know the topic, and nobody can
  send on them from a client, so a "ready" status can't be spoofed.
- **`push_subscriptions`**: no client policies at all. Only the server (service role) reads or writes it. Subscribing is capped at 10 per order
  and refused for orders already `done`.
- **Counter mode**: `find_order_by_number` only matches open orders from the last 24 h.
- **Cleanup**: orders older than 24 h are deleted, and their subscriptions go with them through the cascade.

## Platform notes

- **iPhone (Safari)**: Web Push works only for sites added to the Home Screen (iOS 16.4+). In a normal Safari tab, the page shows
  a hint to keep it open, and relies on the open page, Wake Lock and sound.
- **Autoplay**: sound can play only after the *Enable alert* tap. If a customer opens the page from a notification while the order
  is already ready, the screen flashes and asks for a tap to start the sound.
- **Sounds** are synthesized with Web Audio (chime / beep / siren, chosen in settings), so there are no audio files.

## Project layout

```
app/
  o/[orderId]/        customer page (CustomerOrder.tsx: gesture, realtime, alarm, wake lock)
  r/[restaurantId]/   counter-QR "type your number" page
  login/              staff auth
  dashboard/          orders board (+ settings/)
  api/orders/[id]/    subscribe (public) · status (staff, sends push)
  api/cron/cleanup    Vercel Cron
  icons/[size]        generated PNG app icons
  manifest.ts         PWA manifest
lib/                  supabase clients, push sender, sound engine, i18n (fr/ar)
public/sw.js          service worker (push + notificationclick)
proxy.ts              session refresh + /dashboard guard
supabase/migrations/  schema, RLS, realtime, storage
```
