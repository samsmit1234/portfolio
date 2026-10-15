"use client";

/** Push + "my orders" helpers shared by the order page and the installed customer app (/c). */

const MY_ORDERS_KEY = "nadi:myorders";
export const ORDER_URL_RE = /\/o\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(vapidPublicKey: string) {
  return (
    !!vapidPublicKey &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS version from the UA (iPadOS reports as Mac but keeps "Version/x.y"). */
export function iosVersion(): number {
  const m = navigator.userAgent.match(/OS (\d+)_(\d+)/) ?? navigator.userAgent.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
}

/**
 * Returns this device's push subscription, creating it if needed.
 * Requires notification permission to already be granted.
 */
export async function getPushSubscription(vapidPublicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return (
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }))
  );
}

/** Links a push subscription to one order so "ready" reaches this device. */
export async function linkOrderToPush(orderId: string, sub: PushSubscription): Promise<boolean> {
  const res = await fetch(`/api/orders/${orderId}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

export function readMyOrders(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeMyOrders(ids: string[]) {
  try {
    localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {}
}

export function rememberOrder(id: string) {
  const ids = readMyOrders();
  if (!ids.includes(id)) writeMyOrders([id, ...ids]);
}
