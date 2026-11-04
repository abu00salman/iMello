/* iMello service worker: background notifications only (no offline caching yet).
 * Push payloads carry no message content — just the kind of alert, the room to open and an
 * unread count — so the lock screen never shows what was said or by whom (except a caller's
 * name for incoming calls, which the caller's own app sends). */
const TEXT = {
  ar: { app: "آي ميلو", msg: "رسالة جديدة", msgs: (n) => `${n} رسائل غير مقروءة`, call: "مكالمة صوتية واردة", video: "مكالمة فيديو واردة", tap: "اضغط للرد" },
  en: { app: "iMello", msg: "New message", msgs: (n) => `${n} unread messages`, call: "Incoming voice call", video: "Incoming video call", tap: "Tap to answer" },
};
let locale = null;

async function getLocale() {
  if (locale) return locale;
  try {
    const cache = await caches.open("imello-prefs");
    const res = await cache.match("prefs");
    if (res) locale = (await res.json()).locale;
  } catch { /* best effort */ }
  return locale === "en" || locale === "ar" ? locale : (self.navigator.language || "ar").startsWith("en") ? "en" : "ar";
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("message", (e) => {
  if (e.data?.type === "prefs" && (e.data.locale === "ar" || e.data.locale === "en")) {
    locale = e.data.locale;
    e.waitUntil(caches.open("imello-prefs").then((c) => c.put("prefs", new Response(JSON.stringify({ locale })))));
  }
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch { /* best effort */ }
  event.waitUntil(
    (async () => {
      if (typeof d.u === "number" && self.navigator.setAppBadge) self.navigator.setAppBadge(d.u).catch(() => {});
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const t = TEXT[await getLocale()];
      const base = self.registration.scope;
      const icon = `${base}icons/icon-192.png`;
      if (d.t === "call") {
        // The open app already shows its own ringing screen.
        if (wins.some((w) => w.visibilityState === "visible")) return;
        return self.registration.showNotification(d.n ? `${d.n}` : t.app, {
          body: `${d.v ? "🎥 " + t.video : "📞 " + t.call} · ${t.tap}`,
          tag: `call:${d.r || ""}`,
          renotify: true,
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 400],
          icon,
          badge: icon,
          data: { r: d.r, call: true },
        });
      }
      if (wins.some((w) => w.visibilityState === "visible" && w.focused)) return;
      return self.registration.showNotification(t.app, {
        body: typeof d.u === "number" && d.u > 1 ? t.msgs(d.u) : t.msg,
        tag: "imello-messages",
        renotify: true,
        icon,
        badge: icon,
        data: { r: d.r },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const r = event.notification.data?.r;
  const hash = r ? `#/chats/${encodeURIComponent(r)}` : "#/chats";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope)) {
          w.postMessage({ type: "open", hash });
          return w.focus();
        }
      }
      return self.clients.openWindow(`${self.registration.scope}${hash}`);
    })(),
  );
});

/* Hashed build files are immutable, so a cache hit matches the bytes the current
 * index.html asked for. HTML navigations are always network-only (no-store) so a
 * deploy cannot keep serving the previous app. On activate, every asset cache
 * from an older worker is deleted. */
const ASSET_CACHE = "imello-assets-v2";
const HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|wasm|woff2?|svg|png)$/;

async function fetchFresh(req, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(req, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    event.respondWith(fetchFresh(req, 12_000));
    return;
  }
  if (!HASHED.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetchFresh(req, 20_000);
      if (res.ok && res.type === "basic") cache.put(req.url, res.clone()).catch(() => {});
      return res;
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("imello-assets") && name !== ASSET_CACHE).map((name) => caches.delete(name)));
      try {
        const pages = await Promise.all([
          fetchFresh(self.registration.scope, 8_000).then((r) => r.text()).catch(() => ""),
          fetchFresh(new URL("app/", self.registration.scope).href, 8_000).then((r) => r.text()).catch(() => ""),
          fetchFresh(new URL("app/index.html", self.registration.scope).href, 8_000).then((r) => r.text()).catch(() => ""),
        ]);
        const html = pages.join("\n");
        const cache = await caches.open(ASSET_CACHE);
        for (const req of await cache.keys()) {
          const name = new URL(req.url).pathname.split("/").pop();
          if (name && !html.includes(name)) await cache.delete(req);
        }
      } catch { /* best effort */ }
      await self.clients.claim();
    })(),
  );
});
