/* عامل خدمة «لبابك»: صفحة بديلة عند انقطاع الاتصال + تحديث فوري بعد كل نشر. */
const VERSION = "lubabak-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .catch(() => undefined),
  );
  // نسخة جديدة تحل محل القديمة فوراً بدل انتظار إغلاق كل التبويبات
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // شبكة أولاً دائماً: لا نخزّن HTML حتى لا تبقى نسخة قديمة بعد النشر
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(OFFLINE_URL);
      return cached ?? new Response("offline", { status: 503 });
    }),
  );
});
