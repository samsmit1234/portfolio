# Nadi — QR restaurant pager

**Nadi** (نادِ, "call out") replaces plastic restaurant pagers with a QR code. The customer
scans it and keeps the page open. When the order is ready, the phone rings, vibrates and
flashes, and it also gets a Web Push notification if the browser supports it. No app, no SMS, no WhatsApp.

Next.js (App Router) · TypeScript · Supabase (Postgres, Realtime, Auth, Storage) · Web Push (VAPID) · installable PWA · Netlify.

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

1. **Supabase project**: in the SQL editor, run every file of `supabase/migrations/` in order (`0001` → latest).
   They create the tables, RLS, public RPCs, Realtime triggers and policies, the `logos` bucket, rate limiting, the team
   tables, numbering, stats and the cleanup/reminder jobs. On an existing project, run only the new files, after the code
   that needs them is deployed.
   - Auth → URL Configuration: Site URL = your app URL, and add `<app URL>/auth/callback` to the Redirect URLs
     (email confirmation and password reset land there).
   - Auth → Providers: Email enabled. Turn off "Confirm email" if you want staff to log in right after signing up.
2. **VAPID keys**: run `npm run vapid`.
3. **Env vars**: copy `.env.example` → `.env.local` and fill it in. Use the same variables on Netlify.
4. `npm install && npm run dev` → http://localhost:3000/login (creating an account creates the restaurant).
5. **Deploy on Netlify**: import the repo and set **Base directory = `nadi`** (`netlify.toml` does the rest).
   Cleanup (hourly) and reminders (every 30 s) run from Supabase `pg_cron`, see `0002_reminders.sql` / `0003_netlify.sql`.

Web Push needs HTTPS. `localhost` works for development.

## Security model

- **Staff**: RLS on `restaurants` and `orders` allows rows of the restaurants the user is a member of (`restaurant_members`).
  The owner alone changes settings, the logo and the team; staff join through a single-use invitation link (48 h).
- **Customers** have no direct table access. They read a single order through the `get_public_order(uuid)` RPC
  (security definer), so they need the unguessable UUID.
- **Realtime**: customers can only *receive* broadcasts on `order:*` topics. They need the UUID to know the topic, and nobody can
  send on them from a client, so a "ready" status can't be spoofed.
- **`push_subscriptions`**: no client policies at all. Only the server (service role) reads or writes it. Subscribing is capped at 10 per order
  and refused for orders already `done`.
- **Counter mode**: `find_order_by_number` only matches open orders from the last 24 h. It is called by the server only,
  rate-limited per IP (10/min; push subscribe: 20/min), so order numbers can't be enumerated.
- **Dining-room screen** (`/r/{restaurantId}/screen`): `screen_orders()` returns numbers and status only, never order ids.
- **Push endpoints** must be on a known browser push service (FCM, Mozilla, Apple, Windows), so the server can't be used to
  reach other hosts.
- **Cleanup**: orders older than 24 h are folded into hourly stats (`order_stats_hourly`) and deleted; their subscriptions go with them.

## Platform notes

- **iPhone (Safari)**: Web Push works only for sites added to the Home Screen (iOS 16.4+). In a normal Safari tab, the page shows
  a hint to keep it open, and relies on the open page, Wake Lock and sound.
- **Autoplay**: sound can play only after the *Enable alert* tap. If a customer opens the page from a notification while the order
  is already ready, the screen flashes and asks for a tap to start the sound.
- **Sounds** are synthesized with Web Audio (chime / beep / siren, chosen in settings), so there are no audio files.

## Tests, CI and monitoring

- `npm run typecheck` · `npm run lint` · `npm run test:unit` (pure logic: push allowlist, numbering, stats, redirects).
- End to end: `npm run build:e2e && npm run test:e2e`. Playwright runs the production build against
  `e2e/mock-supabase.mjs` and checks the main flow: create an order → open `/o/{id}` → **Ready** → the customer page turns ready.
- GitHub Actions (`.github/workflows/nadi-ci.yml`) runs all of the above on every push touching `nadi/`.
- Errors: set `SENTRY_DSN` to send server errors to Sentry, web-push failures included (tagged `area=web-push` with the push
  host and status). Without it they are only logged.

## Project layout

```
app/
  o/[orderId]/        customer page (CustomerOrder.tsx: gesture, realtime, alarm, wake lock)
  r/[restaurantId]/   counter-QR "type your number" page (+ screen/: dining-room TV)
  join/[token]/       staff invitation
  auth/callback/      email links (PKCE) · update-password/
  login/              staff auth
  dashboard/          orders board (+ stats/, settings/)
  api/orders/[id]/    subscribe (public) · status, remind (staff, send push)
  api/reminders       repeated alerts, called by pg_cron
  api/cron/cleanup    Vercel Cron
  icons/[size]        generated PNG app icons
  manifest.ts         PWA manifest
lib/                  supabase clients, push sender, sound engine, i18n (fr/ar/en), numbering, stats, monitoring
public/sw.js          service worker (push + notificationclick)
proxy.ts              session refresh + /dashboard guard
supabase/migrations/  schema, RLS, realtime, storage (run in order)
e2e/ tests/           Playwright end-to-end and unit tests
```
