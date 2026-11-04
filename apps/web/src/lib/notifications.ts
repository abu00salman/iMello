/**
 * Message notifications.
 *
 * Privacy by default: a notification shows only the sender's name ("New message from Sara").
 * Message text is shown only if the user turns on "Show message preview".
 *
 * Delivery:
 *  - inside the iMello app (native WebView shell) → posted to the native side, which shows a system
 *    notification (expo-notifications);
 *  - in a browser → the Web Notifications API, when permission is granted.
 * Notifications fire while iMello is open or recently backgrounded. Closed-app push needs a push
 * gateway (see docs/ROADMAP.md).
 */
import { parseAttachment, type MatrixClient } from "@imello/core/messaging";
import { isPingBody } from "./ping";
import { playIncoming, playPing } from "./sounds";
import { EventType, MatrixEventEvent, RoomEvent, type MatrixEvent, type Room } from "matrix-js-sdk";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(data: string): void };
  }
}

const PREVIEW_KEY = "imello.notify.preview";
const ENABLED_KEY = "imello.notify.enabled";

export const inApp = () => typeof window !== "undefined" && !!window.ReactNativeWebView;

export function notificationsSupported(): boolean {
  return inApp() || (typeof Notification !== "undefined");
}

export function notificationsEnabled(): boolean {
  if (localStorage.getItem(ENABLED_KEY) === "false") return false;
  if (inApp()) return localStorage.getItem(ENABLED_KEY) === "true";
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function previewEnabled(): boolean {
  return localStorage.getItem(PREVIEW_KEY) === "true";
}

export function setPreviewEnabled(on: boolean) {
  localStorage.setItem(PREVIEW_KEY, String(on));
}

export async function enableNotifications(): Promise<boolean> {
  if (inApp()) {
    window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "requestNotificationPermission" }));
    localStorage.setItem(ENABLED_KEY, "true");
    return true;
  }
  if (typeof Notification === "undefined") return false;
  const result = await Notification.requestPermission();
  localStorage.setItem(ENABLED_KEY, String(result === "granted"));
  return result === "granted";
}

export function disableNotifications() {
  localStorage.setItem(ENABLED_KEY, "false");
}

interface Texts {
  newMessage: (name: string) => string;
  photo: string;
  voice: string;
  file: string;
}

function show(title: string, body: string, roomId: string) {
  if (inApp()) {
    window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "notify", title, body, roomId }));
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = new Notification(title, { body, tag: roomId, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, silent: false });
  n.onclick = () => {
    window.focus();
    location.hash = `#/chats/${encodeURIComponent(roomId)}`;
    n.close();
  };
}

/** Is the user currently looking at this conversation? */
function viewing(roomId: string): boolean {
  return document.visibilityState === "visible" && decodeURIComponent(location.hash) === `#/chats/${roomId}`;
}

/**
 * Watch for new incoming messages. Returns an unsubscribe function.
 * Also keeps the unread count in the page title, e.g. "(3) iMello".
 */
export function watchMessages(client: MatrixClient, texts: Texts): () => void {
  const me = client.getUserId();
  const seen = new Set<string>();
  const startedAt = Date.now();

  const updateTitle = () => {
    const unread = client.getRooms().reduce((n, r) => n + (r.getUnreadNotificationCount() ?? 0), 0);
    document.title = unread > 0 ? `(${unread}) iMello` : "iMello";
    if (inApp()) window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "badge", count: unread }));
  };

  const handle = (ev: MatrixEvent) => {
    const id = ev.getId();
    if (!id || seen.has(id)) return;
    if (ev.getSender() === me || ev.getTs() < startedAt - 5_000) return;
    if (ev.getType() !== EventType.RoomMessage || ev.isDecryptionFailure()) return;
    const roomId = ev.getRoomId();
    if (!roomId) return;
    seen.add(id);
    updateTitle();
    if (viewing(roomId)) return;
    const room = client.getRoom(roomId);
    const raw = String(ev.getContent().body ?? "");
    if (isPingBody(raw)) playPing();
    else playIncoming((room?.getJoinedMemberCount() ?? 0) > 2);
    if (!notificationsEnabled()) return;
    const sender = room?.getMember(ev.getSender()!)?.name ?? ev.getSender()!;
    const content = ev.getContent();
    const att = parseAttachment(content);
    const body = !previewEnabled()
      ? texts.newMessage(sender)
      : att
        ? att.voice ? texts.voice : att.kind === "image" ? texts.photo : `${texts.file}: ${att.name}`
        : String(content.body ?? "").slice(0, 140);
    show(previewEnabled() ? sender : "iMello", body, roomId);
  };

  const onTimeline = (ev: MatrixEvent, _room: Room | undefined, toStart: boolean | undefined, _removed: boolean, data: { liveEvent?: boolean }) => {
    if (toStart || !data?.liveEvent) return;
    // Encrypted events are handled once decrypted.
    if (ev.isBeingDecrypted() || ev.shouldAttemptDecryption()) return;
    handle(ev);
  };
  const onDecrypted = (ev: MatrixEvent) => handle(ev);
  const onReceipt = () => updateTitle();

  client.on(RoomEvent.Timeline, onTimeline);
  client.on(MatrixEventEvent.Decrypted, onDecrypted);
  client.on(RoomEvent.Receipt, onReceipt);
  document.addEventListener("visibilitychange", updateTitle);
  updateTitle();
  return () => {
    client.off(RoomEvent.Timeline, onTimeline);
    client.off(MatrixEventEvent.Decrypted, onDecrypted);
    client.off(RoomEvent.Receipt, onReceipt);
    document.removeEventListener("visibilitychange", updateTitle);
  };
}
