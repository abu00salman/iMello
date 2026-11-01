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
  } catch {}
  return locale === "en" || locale === "ar" ? locale : (self.navigator.language || "ar").startsWith("en") ? "en" : "ar";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
  } catch {}
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
