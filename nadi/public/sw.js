/* Nadi service worker — receives Web Push and opens the order page. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nadi", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Nadi";
  const options = {
    body: data.body || "",
    tag: data.tag || "nadi",
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 150, 400, 150, 400, 150, 800],
    icon: "/icons/192",
    badge: "/icons/96",
    dir: data.dir || "auto",
    lang: data.lang || "",
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    (async () => {
      // Tell any open copy of the page right away (Realtime may lag behind).
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      wins.forEach((c) => c.postMessage({ type: "order-ready", url: options.data.url }));
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (c.url === target && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
