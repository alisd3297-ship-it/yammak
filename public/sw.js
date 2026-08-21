/* عامل خدمة بسيط: صفحة بديلة عند انقطاع الاتصال (مفيد لغلاف Capacitor المستضاف) */
const CACHE = "yammak-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(OFFLINE_URL);
      return cached ?? new Response("offline", { status: 503 });
    }),
  );
});
