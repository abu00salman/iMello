/**
 * Background notifications (Web Push) — work while iMello is closed:
 *  - iPhone/iPad: only for iMello added to the Home Screen (iOS 16.4+), after allowing notifications;
 *  - Android Chrome and desktop browsers: in the browser too.
 * Not available inside the native app shell (WKWebView/Android WebView have no Push API).
 *
 * Flow: browser push subscription → our API stores it under a random pushkey → this device's
 * homeserver pusher (format "event_id_only") calls the API's push gateway → content-free Web Push.
 */
import type { ImelloApiClient } from "@imello/core";
import type { MatrixClient } from "@imello/core/messaging";

const APP_ID = "com.imello.web";
const STORE = "imello.push";

interface Stored { userId: string; pushkey: string; endpoint: string }

export type BackgroundPushStatus = "on" | "unsupported" | "needsHomeScreen" | "serverOff" | "denied" | "error";

export function backgroundPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS only offers Web Push to Home Screen web apps. */
export function needsHomeScreen(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export function registerServiceWorker(locale: string) {
  if (!("serviceWorker" in navigator)) return;
  // When the app lives in a sub-folder (/iMello/app/) under a landing page, the service worker stays at the
  // site root (/iMello/sw.js) so existing registrations and push subscriptions keep working.
  const swBase = (import.meta.env.VITE_SW_BASE as string | undefined) || import.meta.env.BASE_URL;
  void navigator.serviceWorker
    .register(`${swBase}sw.js`, { scope: swBase })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => reg.active?.postMessage({ type: "prefs", locale }))
    .catch(() => undefined);
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "open" && typeof e.data.hash === "string" && e.data.hash.startsWith("#/")) location.hash = e.data.hash;
  });
}

export function sendPrefsToServiceWorker(locale: string) {
  void navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: "prefs", locale })).catch(() => undefined);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function load(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
}

async function removePusher(client: MatrixClient, pushkey: string) {
  await client.setPusher({ kind: null, app_id: APP_ID, pushkey } as never).catch(() => undefined);
}

/**
 * Make sure this device gets background notifications. Safe to call on every start: it only
 * re-registers when the subscription or account changed. Requires notification permission.
 */
export async function ensureBackgroundPush(client: MatrixClient, api: ImelloApiClient, opts: { locale: string; deviceName: string }): Promise<BackgroundPushStatus> {
  if (!backgroundPushSupported()) return needsHomeScreen() ? "needsHomeScreen" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "error";
  try {
    const { publicKey, gatewayUrl } = await api.pushKey();
    if (!gatewayUrl) return "serverOff";
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const userId = client.getSafeUserId();
    const stored = load();
    if (stored && stored.userId === userId && stored.endpoint === json.endpoint) {
      // Already registered; make sure the homeserver still has the pusher.
      const { pushers } = await client.getPushers();
      if (pushers.some((p) => p.pushkey === stored.pushkey && p.app_id === APP_ID)) return "on";
    }
    if (stored) {
      await removePusher(client, stored.pushkey);
      await api.unregisterPush(stored.pushkey).catch(() => undefined);
    }
    const { pushkey } = await api.registerPush(json);
    await client.setPusher({
      kind: "http",
      app_id: APP_ID,
      app_display_name: "iMello",
      device_display_name: opts.deviceName,
      pushkey,
      lang: opts.locale,
      data: { url: gatewayUrl, format: "event_id_only" },
      append: false,
    } as never);
    localStorage.setItem(STORE, JSON.stringify({ userId, pushkey, endpoint: json.endpoint } satisfies Stored));
    return "on";
  } catch {
    return "error";
  }
}

/** Stop background notifications on this device (also used at sign-out). */
export async function disableBackgroundPush(client: MatrixClient | null, api: ImelloApiClient) {
  const stored = load();
  localStorage.removeItem(STORE);
  if (stored) {
    if (client) await removePusher(client, stored.pushkey);
    await api.unregisterPush(stored.pushkey).catch(() => undefined);
  }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
}
