/**
 * Headless iMello engine. No visible UI.
 * Runs the same matrix-js-sdk + Rust-crypto path as the web client and the e2e tests.
 */
import {
  acceptInvite,
  AttachmentTooLargeError,
  configureSdkLogging,
  conversations,
  downloadAttachment,
  exportKeysToFile,
  importKeysFromFile,
  isRoomEncrypted,
  listDevices,
  loginWithPassword,
  newTransactionId,
  NotEncryptedError,
  parseAttachment,
  readByOthers,
  resumeClient,
  revokeDevice,
  roomMessages,
  sendAttachment,
  sendText,
  setTyping,
  signOut as matrixSignOut,
  startDirectChat,
  startSecureClient,
  WrongPassphraseError,
  type ChatMessage,
  type MatrixClient,
  type Session,
} from "@imello/core/messaging";
import {
  ClientEvent,
  MatrixEventEvent,
  RoomEvent,
  RoomMemberEvent,
  SyncState,
  type MatrixEvent,
} from "matrix-js-sdk";
import { pingRemaining, PING_COOLDOWN_MS, receiptFor, type Receipt } from "../../src/rpc/format";
import { errorMessage, eventMessage, parseRpcMessage, responseMessage, safeError, RpcError } from "../../src/rpc/protocol";
import type { SessionInfo, WireMessage, WireRoom } from "../../src/rpc/wire";
import { clearDeviceSecret, cryptoDbPrefix, cryptoStorageKey, loadDeviceSecret, loadSession, saveDeviceSecret, saveSession, wipeAll } from "./keystore";

configureSdkLogging("error");

type Bridge = { postMessage(data: string): void };
type Host = Window & {
  ReactNativeWebView?: Bridge;
  __imelloReceive?: (raw: string) => void;
  __imelloHostPing?: () => void;
};

const host = window as Host;
let client: MatrixClient | null = null;
let watched: string | null = null;
let pushTimer = 0;
const seen = new Set<string>();
let primed = false;
const PING_KEY = "imello.pingAt";

function post(msg: unknown): void {
  host.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

let acked = false;
let lastSession: SessionInfo | null = null;

function publishSession(info: SessionInfo): void {
  lastSession = info;
  post(eventMessage("session", info));
}

function announce(): void {
  post(eventMessage("hello", { v: 1 }));
  if (lastSession) post(eventMessage("session", lastSession));
}

host.__imelloHostPing = () => announce();
setInterval(() => {
  if (!acked) announce();
}, 1500);

function pretty(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/@([^:\s]+):[^\s,]+/g, "$1");
}

function pingTimes(): Record<string, number> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PING_KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function contentOf(c: MatrixClient, roomId: string, id: string): Record<string, unknown> {
  const room = c.getRoom(roomId);
  const pending = room?.getPendingEvents().find((ev) => (ev.getId() ?? ev.getTxnId() ?? "") === id);
  const live = room?.findEventById(id);
  return (pending ?? live)?.getContent() ?? {};
}

function isPing(c: MatrixClient, msg: ChatMessage): boolean {
  return contentOf(c, msg.roomId, msg.id)["im.imello.ping"] === true;
}

function receiptOf(c: MatrixClient, msg: ChatMessage): Receipt | null {
  if (!msg.isOwn) return null;
  const read = msg.state === "sent" && readByOthers(c, msg.roomId, msg.id);
  return receiptFor(msg.state, read);
}

function toWire(c: MatrixClient, msg: ChatMessage): WireMessage {
  const ping = isPing(c, msg);
  const attachment = msg.attachment;
  return {
    id: msg.id,
    txnId: msg.txnId,
    roomId: msg.roomId,
    sender: msg.sender,
    senderName: pretty(c.getUser(msg.sender)?.displayName || msg.sender),
    body: msg.decryptionFailed ? null : msg.body,
    timestamp: msg.timestamp,
    isOwn: msg.isOwn,
    decryptionFailed: msg.decryptionFailed,
    receipt: receiptOf(c, msg),
    ping,
    attachment: attachment
      ? {
          kind: attachment.kind,
          name: attachment.name,
          mimetype: attachment.mimetype,
          size: attachment.size,
          voice: attachment.voice,
          durationMs: attachment.durationMs,
        }
      : null,
  };
}

function roomsOf(c: MatrixClient): WireRoom[] {
  return conversations(c).map((room) => {
    const typing = room.membership === "join"
      ? (c.getRoom(room.roomId)?.getMembers().filter((m) => m.typing && m.userId !== c.getUserId()).map((m) => pretty(m.name)) ?? [])
      : [];
    const last = room.lastMessage ? toWire(c, room.lastMessage) : null;
    return {
      roomId: room.roomId,
      name: pretty(room.name),
      membership: room.membership,
      otherUserId: room.otherUserId,
      lastActivity: room.lastActivity,
      unread: room.unread,
      typing,
      last: last
        ? {
            own: last.isOwn,
            ping: last.ping,
            failed: last.receipt === "failed",
            body: last.body,
            voice: last.attachment?.voice ?? false,
            kind: last.ping ? "text" : (last.attachment?.kind ?? (last.body ? "text" : "none")),
            receipt: last.receipt,
          }
        : null,
    };
  });
}

function note(c: MatrixClient, roomId: string): void {
  const room = c.getRoom(roomId);
  const name = pretty(room?.name || roomId);
  for (const msg of roomMessages(c, roomId).map((m) => toWire(c, m))) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    if (!primed || msg.isOwn) continue;
    const people = c.getRoom(roomId)?.getJoinedMemberCount() ?? 0;
    post(eventMessage("activity", {
      roomId,
      eventId: msg.id,
      senderName: msg.senderName,
      ping: msg.ping,
      roomName: name,
      group: people > 2,
    }));
    if (msg.ping) post(eventMessage("ping", { roomId, eventId: msg.id }));
  }
}

function pushRooms(): void {
  const current = client;
  if (!current) return;
  const rooms = roomsOf(current);
  for (const room of rooms) note(current, room.roomId);
  primed = true;
  post(eventMessage("rooms", rooms));
  if (watched) post(eventMessage("timeline", { roomId: watched, messages: roomMessages(current, watched).map((m) => toWire(current, m)) }));
}

function schedule(): void {
  if (pushTimer) return;
  pushTimer = window.setTimeout(() => {
    pushTimer = 0;
    pushRooms();
  }, 150);
}

function bind(c: MatrixClient): void {
  const bump = () => schedule();
  const events = [
    RoomEvent.Timeline,
    RoomEvent.LocalEchoUpdated,
    RoomEvent.MyMembership,
    RoomEvent.Name,
    RoomEvent.Receipt,
    ClientEvent.Room,
    ClientEvent.AccountData,
    ClientEvent.Sync,
    MatrixEventEvent.Decrypted,
    RoomMemberEvent.Typing,
  ] as const;
  const emitter = c as unknown as { on(e: string, fn: () => void): void };
  for (const event of events) emitter.on(event, bump);
}

async function start(session: Session, isTemporary: boolean, password?: string): Promise<void> {
  const previous = client;
  previous?.stopClient();
  const cryptoStore = isTemporary
    ? ({ kind: "memory" } as const)
    : ({
        kind: "indexeddb" as const,
        prefix: cryptoDbPrefix(session.userId, session.deviceId),
        storageKey: await cryptoStorageKey(session.userId, session.deviceId),
      });
  const next = await startSecureClient({ session, cryptoStore, passwordForCrossSigningSetup: password });
  client = next;
  seen.clear();
  primed = false;
  bind(next);
  const info: SessionInfo = {
    status: "ready",
    userId: session.userId,
    deviceId: session.deviceId,
    accessToken: session.accessToken,
    homeserverUrl: session.homeserverUrl,
    temporary: isTemporary,
  };
  publishSession(info);
  schedule();
}

function requireClient(): MatrixClient {
  if (!client) throw new RpcError("signed_out", "signed_out");
  return client;
}

async function signIn(params: { homeserverUrl: string; username: string; password: string; temporary?: boolean; deviceSecret?: boolean }): Promise<{ ok: true }> {
  const session = await loginWithPassword(params.homeserverUrl, params.username, params.password, deviceName(!!params.temporary));
  if (!params.temporary) await saveSession(session);
  if (params.deviceSecret) await saveDeviceSecret(session.userId, params.password);
  await start(session, !!params.temporary, params.password);
  return { ok: true };
}

function deviceName(temp: boolean): string {
  const os = /Android/i.test(navigator.userAgent) ? "Android" : "iOS";
  return `iMello · ${os}${temp ? " (temporary)" : ""}`;
}

async function doSignOut(): Promise<{ ok: true }> {
  const current = client;
  client = null;
  if (current) await matrixSignOut(current).catch(() => undefined);
  await wipeAll();
  publishSession({ status: "signedOut" });
  return { ok: true };
}

async function protect(params: { password: string }): Promise<{ ok: true }> {
  const c = requireClient();
  const secret = await loadDeviceSecret(c.getSafeUserId());
  if (!secret) throw new RpcError("no_device_secret", "no_device_secret");
  const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: c.getSafeUserId() }, password: secret };
  try {
    await c.setPassword(auth as never, params.password, false);
  } catch (err) {
    const sessionId = (err as { data?: { session?: string } }).data?.session;
    if (!sessionId) throw err;
    await c.setPassword({ ...auth, session: sessionId } as never, params.password, false);
  }
  await clearDeviceSecret(c.getSafeUserId());
  return { ok: true };
}

async function send(params: { roomId: string; body: string }): Promise<{ eventId: string }> {
  const body = params.body.trim();
  if (!body) throw new RpcError("empty", "empty");
  const eventId = await sendText(requireClient(), params.roomId, body);
  schedule();
  return { eventId };
}

async function ping(params: { roomId: string }): Promise<{ eventId: string | null; retryAt: number }> {
  const c = requireClient();
  const map = pingTimes();
  const now = Date.now();
  const last = map[params.roomId];
  if (pingRemaining(last, now) > 0) return { eventId: null, retryAt: (last ?? now) + PING_COOLDOWN_MS };
  if (!(await isRoomEncrypted(c, params.roomId))) throw new NotEncryptedError(params.roomId);
  const res = await c.sendMessage(params.roomId, { msgtype: "m.text", body: "نكزة!", "im.imello.ping": true } as never, newTransactionId());
  map[params.roomId] = now;
  sessionStorage.setItem(PING_KEY, JSON.stringify(map));
  schedule();
  return { eventId: res.event_id, retryAt: now + PING_COOLDOWN_MS };
}

async function retry(params: { roomId: string; id: string }): Promise<{ ok: true }> {
  const c = requireClient();
  const room = c.getRoom(params.roomId);
  const ev = room?.getPendingEvents().find((item) => (item.getId() ?? item.getTxnId() ?? "") === params.id);
  if (!room || !ev) throw new RpcError("missing", "missing");
  await c.resendEvent(ev, room);
  schedule();
  return { ok: true };
}

function bytesOf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64Of(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let raw = "";
  const size = 0x2000;
  for (let i = 0; i < bytes.length; i += size) {
    const slice = bytes.subarray(i, i + size);
    let part = "";
    for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j] ?? 0);
    raw += part;
  }
  return btoa(raw);
}

async function attach(params: { roomId: string; name: string; mimetype: string; base64: string; voice?: boolean; durationMs?: number }): Promise<{ eventId: string }> {
  const data = bytesOf(params.base64);
  const blob = new Blob([data as BlobPart], { type: params.mimetype });
  try {
    const eventId = await sendAttachment(requireClient(), params.roomId, blob, {
      name: params.name,
      mimetype: params.mimetype,
      voice: params.voice,
      durationMs: params.durationMs,
    });
    schedule();
    return { eventId };
  } catch (err) {
    if (err instanceof AttachmentTooLargeError) throw new RpcError("too_large", "too_large");
    throw err;
  }
}

async function fetchFile(params: { roomId: string; eventId: string }): Promise<{ base64: string; mimetype: string; name: string }> {
  const c = requireClient();
  const room = c.getRoom(params.roomId);
  const ev = room?.findEventById(params.eventId);
  const info = ev ? parseAttachment(ev.getContent()) : null;
  if (!info) throw new RpcError("missing", "missing");
  const blob = await downloadAttachment(c, info);
  return { base64: b64Of(await blob.arrayBuffer()), mimetype: info.mimetype, name: info.name };
}

async function markRead(params: { roomId: string }): Promise<{ ok: true }> {
  const c = requireClient();
  const room = c.getRoom(params.roomId);
  const events = room?.getLiveTimeline().getEvents() ?? [];
  const last = events[events.length - 1];
  if (last) await c.sendReadReceipt(last as MatrixEvent);
  return { ok: true };
}

async function typing(params: { roomId: string; typing: boolean }): Promise<{ ok: true }> {
  await setTyping(requireClient(), params.roomId, params.typing);
  return { ok: true };
}

async function openDirect(params: { userId: string }): Promise<{ roomId: string }> {
  const roomId = await startDirectChat(requireClient(), params.userId);
  schedule();
  return { roomId };
}

async function join(params: { roomId: string }): Promise<{ ok: true }> {
  await acceptInvite(requireClient(), params.roomId);
  schedule();
  return { ok: true };
}

async function backup(params: { passphrase: string }): Promise<{ file: string }> {
  return { file: await exportKeysToFile(requireClient(), params.passphrase) };
}

async function restore(params: { file: string; passphrase: string }): Promise<{ n: number }> {
  try {
    const n = await importKeysFromFile(requireClient(), params.file, params.passphrase);
    schedule();
    return { n };
  } catch (err) {
    if (err instanceof WrongPassphraseError) throw new RpcError("wrong_passphrase", "wrong_passphrase");
    throw err;
  }
}

async function devices(): Promise<{ devices: { deviceId: string; displayName: string | null; lastSeenTs: number | null; isCurrent: boolean }[] }> {
  const list = await listDevices(requireClient());
  return { devices: list.map((d) => ({ deviceId: d.deviceId, displayName: d.displayName, lastSeenTs: d.lastSeenTs, isCurrent: d.isCurrent })) };
}

async function revoke(params: { deviceId: string; password?: string }): Promise<{ ok: true }> {
  const c = requireClient();
  const password = params.password || (await loadDeviceSecret(c.getSafeUserId()));
  if (!password) throw new RpcError("need_password", "need_password");
  await revokeDevice(c, params.deviceId, password);
  return { ok: true };
}

async function resume(): Promise<{ ok: true }> {
  const c = client;
  if (!c) return { ok: true };
  const state = c.getSyncState();
  if (state === SyncState.Syncing || state === SyncState.Prepared || state === SyncState.Catchup) return { ok: true };
  await Promise.race([resumeClient(c), new Promise((resolve) => setTimeout(resolve, 8_000))]);
  return { ok: true };
}

async function messages(params: { roomId: string }): Promise<{ messages: WireMessage[] }> {
  const c = requireClient();
  return { messages: roomMessages(c, params.roomId).map((m) => toWire(c, m)) };
}

const handlers: Record<string, (params: never) => Promise<unknown>> = {
  signIn,
  signOut: doSignOut,
  protect,
  snapshot: async () => {
    const c = requireClient();
    return { rooms: roomsOf(c) };
  },
  messages,
  watch: async (params: { roomId: string | null }) => {
    watched = params.roomId;
    if (client && params.roomId) post(eventMessage("timeline", { roomId: params.roomId, messages: roomMessages(client, params.roomId).map((m) => toWire(client!, m)) }));
    return { ok: true };
  },
  sendText: send,
  sendPing: ping,
  retry,
  sendAttachment: attach,
  downloadAttachment: fetchFile,
  markRead,
  setTyping: typing,
  openDirect,
  acceptInvite: join,
  exportKeys: backup,
  importKeys: restore,
  listDevices: devices,
  revokeDevice: revoke,
  resume,
  ack: async () => {
    acked = true;
    return { ok: true };
  },
};

async function onRequest(raw: string): Promise<void> {
  const msg = parseRpcMessage(raw);
  if (!msg || msg.kind !== "req") return;
  const handler = handlers[msg.method];
  if (!handler) {
    post(errorMessage(msg.id, "unknown_method", msg.method));
    return;
  }
  try {
    post(responseMessage(msg.id, await handler(msg.params as never)));
  } catch (err) {
    if (err instanceof NotEncryptedError) post(errorMessage(msg.id, "not_encrypted", "not_encrypted"));
    else {
      const safe = safeError(err);
      post(errorMessage(msg.id, safe.code, safe.message));
    }
  }
}

host.__imelloReceive = (raw: string) => {
  void onRequest(raw);
};

announce();

void (async () => {
  try {
    const session = await loadSession();
    if (!session) {
      publishSession({ status: "signedOut" });
      return;
    }
    await start(session, false);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus;
    if (status === 401 || status === 403) {
      await wipeAll().catch(() => undefined);
      publishSession({ status: "signedOut" });
      return;
    }
    const safe = safeError(err);
    post(eventMessage("engine-error", safe));
  }
})();
