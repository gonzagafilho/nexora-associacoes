const CACHE_NAME = "nexora-pwa-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/nexora-logo.png",
  "/icons/icon-192.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.svg",
  "/icons/icon-512.png",
  "/icons/icon-maskable.svg",
  "/icons/icon-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined);
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || caches.match("/"))
    );
    return;
  }

  if (!requestUrl.pathname.startsWith("/icons/") && !/\.(css|js|png|jpg|jpeg|svg|webp|woff2?)$/i.test(requestUrl.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined);
      return response;
    }))
  );
});

function parsePushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_error) {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || "NEXORA Gestão";
  const options = {
    body: payload.body || "Nova notificação disponível.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-maskable.png",
    data: {
      url: payload.url || "/#notificacoes",
      notificationId: payload.notificationId || "",
      module: payload.module || "",
      severity: payload.severity || "low"
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/#notificacoes", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      const sameOrigin = new URL(client.url).origin === self.location.origin;
      if (!sameOrigin) continue;
      await client.focus();
      if ("navigate" in client) return client.navigate(targetUrl);
      return;
    }
    return clients.openWindow(targetUrl);
  })());
});
