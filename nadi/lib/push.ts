import "server-only";

import webpush, { WebPushError } from "web-push";
import { getAdminSupabase } from "./supabase/server";
import { t } from "./i18n";
import type { Lang } from "./types";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

/**
 * Sends a "ready" Web Push to every subscription of the order.
 * Subscriptions whose endpoint answers 404/410 are gone for good and are deleted.
 */
export async function sendReadyPush(opts: {
  orderId: string;
  number: string;
  restaurantName: string;
  lang: Lang;
  baseUrl: string;
}) {
  if (!configure()) return { sent: 0, removed: 0, skipped: "vapid-not-configured" as const };

  const admin = getAdminSupabase();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("order_id", opts.orderId);
  if (error || !subs?.length) return { sent: 0, removed: 0 };

  const d = t(opts.lang);
  const payload = JSON.stringify({
    title: `${d.pushTitle} #${opts.number}`,
    body: `${opts.restaurantName} — ${d.readyCta}`,
    url: `${opts.baseUrl}/o/${opts.orderId}`,
    tag: `order-${opts.orderId}`,
    dir: opts.lang === "ar" ? "rtl" : "ltr",
    lang: opts.lang,
  });

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 30, urgency: "high", topic: `order${opts.orderId.replace(/-/g, "").slice(0, 24)}` },
        );
        sent++;
      } catch (err) {
        const code = err instanceof WebPushError ? err.statusCode : 0;
        if (code === 404 || code === 410) gone.push(s.id);
        else console.error("web-push failed", code, (err as Error).message);
      }
    }),
  );

  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return { sent, removed: gone.length };
}
