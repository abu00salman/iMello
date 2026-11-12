/**
 * iMello secure messaging layer.
 *
 * This is a thin, opinionated wrapper around matrix-js-sdk + its Rust crypto
 * stack (matrix-sdk-crypto-wasm / vodozemac: Olm + Megolm). iMello does NOT
 * implement any cryptography itself. The wrapper's job is to make insecure
 * states hard to reach:
 *   - every conversation iMello creates has encryption enabled from the first event;
 *   - sendText() refuses to send into a room without encryption enabled;
 *   - message bodies are never logged.
 *
 * The same module is used by the web client and by the end-to-end test suite,
 * so the tests exercise the production code path.
 */
import {
  ClientEvent,
  createClient,
  MatrixEventEvent,
  EventType,
  MsgType,
  PendingEventOrdering,
  Preset,
  RoomEvent,
  SyncState,
  type ICreateClientOpts,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { logger as sdkLogger } from "matrix-js-sdk/lib/logger.js";
import { parseAttachment, type AttachmentInfo } from "./attachments";

export * from "./attachments";
export * from "./keyExport";
export * from "./calls";

export const MEGOLM_ALGORITHM = "m.megolm.v1.aes-sha2";

/** Quieten the SDK. Its default debug logging can include event metadata. */
export function configureSdkLogging(level: "error" | "warn" | "info" | "debug" = "warn"): void {
  // The exported logger is a loglevel instance at runtime; the typings hide setLevel.
  (sdkLogger as unknown as { setLevel(l: string): void }).setLevel(level);
}

export class NotEncryptedError extends Error {
  constructor(roomId: string) {
    super(`Refusing to send: encryption is not enabled in room ${roomId}`);
    this.name = "NotEncryptedError";
  }
}

export interface Session {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
}

export type CryptoStoreOptions =
  /** Keys live only in memory and vanish with the process/tab (temporary sessions, tests). */
  | { kind: "memory" }
  /** Keys persisted in IndexedDB, encrypted at rest with `storageKey` (32 bytes). */
  | { kind: "indexeddb"; prefix: string; storageKey: Uint8Array };

export async function loginWithPassword(
  homeserverUrl: string,
  username: string,
  password: string,
  deviceDisplayName: string,
): Promise<Session> {
  const tmp = createClient({ baseUrl: homeserverUrl });
  const res = await tmp.loginRequest({
    type: "m.login.password",
    identifier: { type: "m.id.user", user: username },
    password,
    initial_device_display_name: deviceDisplayName,
  });
  return { homeserverUrl, userId: res.user_id, accessToken: res.access_token, deviceId: res.device_id };
}

export interface StartOptions {
  session: Session;
  cryptoStore: CryptoStoreOptions;
  /** Optional: the password just used to sign in, used once to set up cross-signing for a brand-new account. */
  passwordForCrossSigningSetup?: string;
  clientOpts?: Partial<ICreateClientOpts>;
  initialSyncLimit?: number;
  /** Open the app after this long even if the first sync hasn't finished (default 12 s). */
  firstSyncTimeoutMs?: number;
}

const START_OPTS = {
  initialSyncLimit: 30,
  lazyLoadMembers: true,
  // Keep unsent messages in a separate list so they can be shown and retried.
  pendingEventOrdering: PendingEventOrdering.Detached,
} as const;

/** Resume syncing after stopClient() (e.g. the app returned from background or the network came back). */
export async function resumeClient(client: MatrixClient): Promise<void> {
  const synced = waitForSync(client);
  await client.startClient(START_OPTS);
  await synced;
}

/** Create a client, initialise end-to-end encryption, and wait for the first sync. */
export async function startSecureClient(opts: StartOptions): Promise<MatrixClient> {
  const { session } = opts;
  const client = createClient({
    baseUrl: session.homeserverUrl,
    userId: session.userId,
    accessToken: session.accessToken,
    deviceId: session.deviceId,
    timelineSupport: true,
    ...opts.clientOpts,
  });

  if (opts.cryptoStore.kind === "memory") {
    await client.initRustCrypto({ useIndexedDB: false });
  } else {
    await client.initRustCrypto({
      useIndexedDB: true,
      cryptoDatabasePrefix: opts.cryptoStore.prefix,
      storageKey: opts.cryptoStore.storageKey,
    });
  }

  const prepared = waitForSync(client);
  await client.startClient({ ...START_OPTS, initialSyncLimit: opts.initialSyncLimit ?? START_OPTS.initialSyncLimit });
  // Don't hold the app on a splash screen when the network is slow or the server is briefly
  // unreachable: after a grace period the UI opens and sync keeps catching up in the background.
  // An invalid token (401) still rejects so the caller can sign the device out.
  void prepared.catch(() => undefined); // a late 401 is handled by the session layer, not unhandled
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    prepared,
    new Promise<void>((resolve) => (timer = setTimeout(resolve, opts.firstSyncTimeoutMs ?? 12_000))),
  ]).finally(() => clearTimeout(timer));

  if (opts.passwordForCrossSigningSetup) {
    await ensureCrossSigning(client, opts.passwordForCrossSigningSetup);
  }
  return client;
}

function waitForSync(client: MatrixClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSync = (state: SyncState, _prev: SyncState | null, data?: { error?: Error }) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        client.off(ClientEvent.Sync, onSync);
        resolve();
      } else if (state === SyncState.Error && data?.error && (data.error as { httpStatus?: number }).httpStatus === 401) {
        client.off(ClientEvent.Sync, onSync);
        reject(data.error);
      }
    };
    client.on(ClientEvent.Sync, onSync);
  });
}

/**
 * Bootstrap cross-signing keys the first time an account signs in, so that this
 * device's identity is signed by the user's master key. Never resets an
 * existing identity (that would be a silent key change for every contact).
 */
export async function ensureCrossSigning(client: MatrixClient, password: string): Promise<boolean> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("Crypto not initialised");
  if (await crypto.isCrossSigningReady()) return false;
  if (await crypto.userHasCrossSigningKeys(client.getSafeUserId(), true)) {
    // Another device already owns the identity; this device must be verified from it (Phase 3).
    return false;
  }
  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: async (makeRequest) => {
      await makeRequest({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: client.getSafeUserId() },
        password,
      });
    },
  });
  return true;
}

/** Create a private, encrypted one-to-one conversation and invite `otherUserId`. */
export async function startDirectChat(client: MatrixClient, otherUserId: string): Promise<string> {
  const existing = findDirectRoom(client, otherUserId);
  if (existing) {
    const room = client.getRoom(existing);
    if (room?.getMyMembership() === "invite") await acceptInvite(client, existing);
    else void markDirect(client, otherUserId, existing).catch(() => undefined);
    return existing;
  }
  let pending = creating.get(client);
  if (!pending) creating.set(client, (pending = new Map()));
  const inFlight = pending.get(otherUserId);
  if (inFlight) return inFlight;
  const p = createDirectRoom(client, otherUserId).finally(() => pending!.delete(otherUserId));
  pending.set(otherUserId, p);
  return p;
}

async function createDirectRoom(client: MatrixClient, otherUserId: string): Promise<string> {
  const { room_id: roomId } = await client.createRoom({
    preset: Preset.TrustedPrivateChat,
    is_direct: true,
    invite: [otherUserId],
    initial_state: [
      { type: EventType.RoomEncryption, state_key: "", content: { algorithm: MEGOLM_ALGORITHM } },
      { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "invited" } },
      { type: EventType.RoomGuestAccess, state_key: "", content: { guest_access: "forbidden" } },
    ],
  });
  await markDirect(client, otherUserId, roomId);
  return roomId;
}

/** Create a private, encrypted group conversation with a name and invite the chosen people. */
export async function createGroupChat(client: MatrixClient, name: string, userIds: string[]): Promise<string> {
  const title = name.trim().slice(0, 64);
  if (!title || userIds.length === 0) throw new Error("group_needs_name_and_people");
  const { room_id: roomId } = await client.createRoom({
    preset: Preset.PrivateChat,
    name: title,
    invite: [...new Set(userIds)],
    initial_state: [
      { type: EventType.RoomEncryption, state_key: "", content: { algorithm: MEGOLM_ALGORITHM } },
      { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "invited" } },
      { type: EventType.RoomGuestAccess, state_key: "", content: { guest_access: "forbidden" } },
    ],
  });
  return roomId;
}

// m.direct is a read-modify-write of one account-data blob: serialise updates per client so two
// quick calls can't overwrite each other (that lost entries and led to duplicate chats).
const directQueue = new WeakMap<MatrixClient, Promise<unknown>>();

async function markDirect(client: MatrixClient, otherUserId: string, roomId: string) {
  const run = async () => {
    const current = (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
    if (current[otherUserId]?.includes(roomId)) return;
    const rooms = new Set(current[otherUserId] ?? []);
    rooms.add(roomId);
    await client.setAccountData(EventType.Direct, { ...current, [otherUserId]: [...rooms] });
  };
  const next = (directQueue.get(client) ?? Promise.resolve()).then(run, run);
  directQueue.set(client, next.catch(() => undefined));
  return next;
}

/** Is this a one-to-one conversation between me and `otherUserId` (joined or pending invite)? */
function isOneToOneWith(client: MatrixClient, room: Room, otherUserId: string): boolean {
  const mine = room.getMyMembership();
  if (mine !== "join" && mine !== "invite") return false;
  if (mine === "invite") return room.getDMInviter() === otherUserId || room.getMember(client.getSafeUserId())?.events.member?.getSender() === otherUserId;
  const people = room.getMembers().filter((m) => m.membership === "join" || m.membership === "invite");
  return people.length <= 2 && people.some((m) => m.userId === otherUserId);
}

/**
 * The existing conversation with this person, if any. Checks m.direct first, then every room —
 * including an invite they sent that hasn't been accepted yet — so pressing "Message" on both
 * sides doesn't create two rooms. Prefers a joined room, then the most recently active.
 */
export function findDirectRoom(client: MatrixClient, otherUserId: string): string | null {
  const direct = (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
  const candidates = new Map<string, Room>();
  for (const roomId of direct[otherUserId] ?? []) {
    const room = client.getRoom(roomId);
    if (room && isOneToOneWith(client, room, otherUserId)) candidates.set(roomId, room);
  }
  for (const room of client.getRooms()) {
    if (!candidates.has(room.roomId) && isOneToOneWith(client, room, otherUserId)) candidates.set(room.roomId, room);
  }
  const ranked = [...candidates.values()].sort(
    (a, b) =>
      Number(b.getMyMembership() === "join") - Number(a.getMyMembership() === "join") ||
      b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
  );
  return ranked[0]?.roomId ?? null;
}

/** Creating a chat with the same person twice at once returns the same room (per client). */
const creating = new WeakMap<MatrixClient, Map<string, Promise<string>>>();

/** Accept an invitation to a conversation. */
export async function acceptInvite(client: MatrixClient, roomId: string): Promise<void> {
  const room = client.getRoom(roomId);
  const inviter = room?.getMember(client.getSafeUserId())?.events.member?.getSender();
  await client.joinRoom(roomId);
  if (inviter && room?.getDMInviter()) await markDirect(client, inviter, roomId);
}

export async function isRoomEncrypted(client: MatrixClient, roomId: string): Promise<boolean> {
  const crypto = client.getCrypto();
  if (!crypto) return false;
  return crypto.isEncryptionEnabledInRoom(roomId);
}

/** Generate a stable transaction ID for a message. Re-sending with the same ID is idempotent server-side. */
export function newTransactionId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return "im" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Send a text message. Throws NotEncryptedError if encryption is not enabled
 * in the room — iMello never falls back to plaintext.
 */
export async function sendText(
  client: MatrixClient,
  roomId: string,
  body: string,
  opts: { txnId?: string; replyToEventId?: string } = {},
): Promise<string> {
  if (!(await isRoomEncrypted(client, roomId))) throw new NotEncryptedError(roomId);
  const content: Record<string, unknown> = { msgtype: MsgType.Text, body };
  if (opts.replyToEventId) content["m.relates_to"] = { "m.in_reply_to": { event_id: opts.replyToEventId } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.sendMessage(roomId, content as any, opts.txnId ?? newTransactionId());
  return res.event_id;
}

export type MessageState = "sending" | "sent" | "failed";

export interface ChatMessage {
  id: string;
  txnId: string | null;
  roomId: string;
  sender: string;
  body: string | null;
  timestamp: number;
  isOwn: boolean;
  encrypted: boolean;
  decryptionFailed: boolean;
  state: MessageState;
  replyTo: string | null;
  /** Photo, file or voice message (always end-to-end encrypted). */
  attachment: AttachmentInfo | null;
  /** Emoji reactions, grouped by emoji (m.annotation relations, encrypted like the messages). */
  reactions: Reaction[];
  /** The text was changed after sending (m.replace); `body` is the latest version. */
  edited: boolean;
  /** The sender deleted this message (redaction). */
  deleted: boolean;
}

export interface Reaction {
  key: string;
  count: number;
  /** My own reaction event, so tapping again removes it. */
  myEventId: string | null;
}

type RelatesTo = { rel_type?: string; event_id?: string; key?: string; "m.in_reply_to"?: { event_id?: string } };

function relatesTo(ev: MatrixEvent): RelatesTo | undefined {
  return ev.getContent()["m.relates_to"] as RelatesTo | undefined;
}

export function toChatMessage(client: MatrixClient, ev: MatrixEvent): ChatMessage | null {
  const type = ev.getType();
  if (type !== EventType.RoomMessage && type !== EventType.RoomMessageEncrypted) return null;
  const base = {
    id: ev.getId() ?? ev.getTxnId() ?? "",
    txnId: ev.getTxnId() ?? ev.getUnsigned().transaction_id ?? null,
    roomId: ev.getRoomId() ?? "",
    sender: ev.getSender() ?? "",
    timestamp: ev.getTs(),
    isOwn: ev.getSender() === client.getUserId(),
    encrypted: ev.isEncrypted(),
    reactions: [] as Reaction[],
    edited: false,
  };
  if (ev.isRedacted()) {
    return { ...base, body: null, decryptionFailed: false, state: "sent", replyTo: null, attachment: null, deleted: true };
  }
  const decryptionFailed = ev.isDecryptionFailure();
  if (!decryptionFailed && ev.getType() !== EventType.RoomMessage) return null; // still decrypting
  const rel = relatesTo(ev);
  if (rel?.rel_type === "m.replace") return null; // an edit: folded into the original below
  const content = ev.getContent();
  const status = ev.status;
  return {
    ...base,
    body: decryptionFailed ? null : typeof content.body === "string" ? content.body : null,
    decryptionFailed,
    state: status === "not_sent" ? "failed" : status && status !== "sent" ? "sending" : "sent",
    replyTo: rel?.["m.in_reply_to"]?.event_id ?? null,
    attachment: decryptionFailed ? null : parseAttachment(content),
    deleted: false,
  };
}

export function roomMessages(client: MatrixClient, roomId: string): ChatMessage[] {
  const room = client.getRoom(roomId);
  if (!room) return [];
  const me = client.getUserId();
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  const events = [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()];
  // Relations first: reactions and edits that point at messages in this window.
  const reactions = new Map<string, Map<string, { count: number; mine: string | null; senders: Set<string> }>>();
  const edits = new Map<string, { ts: number; body: string; sender: string }>();
  for (const ev of events) {
    if (ev.isRedacted() || ev.isDecryptionFailure()) continue;
    const rel = relatesTo(ev);
    if (!rel?.event_id) continue;
    if (ev.getType() === EventType.Reaction && rel.rel_type === "m.annotation" && rel.key) {
      const byKey = reactions.get(rel.event_id) ?? new Map();
      const entry = byKey.get(rel.key) ?? { count: 0, mine: null, senders: new Set<string>() };
      const sender = ev.getSender() ?? "";
      if (entry.senders.has(sender)) continue; // one reaction per person per emoji
      entry.senders.add(sender);
      entry.count += 1;
      if (sender === me) entry.mine = ev.getId() ?? null;
      byKey.set(rel.key, entry);
      reactions.set(rel.event_id, byKey);
    } else if (ev.getType() === EventType.RoomMessage && rel.rel_type === "m.replace") {
      const next = ev.getContent()["m.new_content"] as { body?: unknown } | undefined;
      const prev = edits.get(rel.event_id);
      if (typeof next?.body === "string" && (!prev || prev.ts <= ev.getTs())) edits.set(rel.event_id, { ts: ev.getTs(), body: next.body, sender: ev.getSender() ?? "" });
    }
  }
  for (const ev of events) {
    const msg = toChatMessage(client, ev);
    if (!msg) continue;
    // Deduplicate local echo vs. remote echo by event ID and transaction ID.
    const key = msg.txnId && msg.isOwn ? `txn:${msg.txnId}` : `id:${msg.id}`;
    if (seen.has(key) || seen.has(`id:${msg.id}`)) continue;
    seen.add(key);
    seen.add(`id:${msg.id}`);
    const edit = edits.get(msg.id);
    // Only the original sender may edit; anything else is ignored.
    if (edit && !msg.deleted && edit.sender === msg.sender) {
      msg.body = edit.body;
      msg.edited = true;
    }
    const r = reactions.get(msg.id);
    if (r && !msg.deleted) msg.reactions = [...r].map(([k, v]) => ({ key: k, count: v.count, myEventId: v.mine }));
    out.push(msg);
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

/** React to a message with an emoji (encrypted in encrypted rooms). */
export async function sendReaction(client: MatrixClient, roomId: string, eventId: string, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.sendEvent(roomId, EventType.Reaction as any, { "m.relates_to": { rel_type: "m.annotation", event_id: eventId, key } } as any);
}

/** Remove my reaction (or delete my message): a redaction. */
export async function redactEvent(client: MatrixClient, roomId: string, eventId: string): Promise<void> {
  await client.redactEvent(roomId, eventId);
}

/** Change the text of one of my messages (m.replace; older clients see "* new text"). */
export async function editMessage(client: MatrixClient, roomId: string, eventId: string, body: string): Promise<void> {
  if (!(await isRoomEncrypted(client, roomId))) throw new NotEncryptedError(roomId);
  const text = body.trim();
  if (!text) throw new Error("empty_edit");
  const content = {
    msgtype: MsgType.Text,
    body: `* ${text}`,
    "m.new_content": { msgtype: MsgType.Text, body: text },
    "m.relates_to": { rel_type: "m.replace", event_id: eventId },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await client.sendMessage(roomId, content as any);
}

export interface ConversationSummary {
  roomId: string;
  name: string;
  membership: string;
  otherUserId: string | null;
  lastMessage: ChatMessage | null;
  lastActivity: number;
  unread: number;
}

export function conversations(client: MatrixClient): ConversationSummary[] {
  const direct = (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
  const roomToUser = new Map<string, string>();
  for (const [user, rooms] of Object.entries(direct)) for (const r of rooms) roomToUser.set(r, user);
  return client
    .getRooms()
    .filter((r) => ["join", "invite"].includes(r.getMyMembership()))
    .map((room: Room) => {
      const last = lastMessage(client, room);
      const otherUserId =
        roomToUser.get(room.roomId) ??
        room.getDMInviter() ??
        room.getMembers().find((m) => m.userId !== client.getUserId())?.userId ??
        null;
      return {
        roomId: room.roomId,
        name: room.name,
        membership: room.getMyMembership(),
        otherUserId,
        lastMessage: last,
        lastActivity: last?.timestamp ?? room.getLastActiveTimestamp(),
        unread: room.getUnreadNotificationCount() ?? 0,
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .filter(dedupeByPerson(client));
}

function isNamedGroup(room: Room): boolean {
  if (room.getDMInviter()) return false;
  const name = room.currentState.getStateEvents(EventType.RoomName, "")?.getContent()?.name;
  return typeof name === "string" && name.trim().length > 0;
}

/**
 * One row per person. If several one-to-one rooms exist with the same person (from earlier
 * duplicate creation), keep the joined, most recently active one; a pending invite from someone
 * you already have a conversation with is hidden (accepting "Message" later reuses the room).
 * Rooms are never deleted — history stays on the server.
 */
function dedupeByPerson(client: MatrixClient) {
  const seen = new Set<string>();
  return (c: ConversationSummary, _i: number, all: ConversationSummary[]) => {
    const room = client.getRoom(c.roomId);
    const people = room?.getMembers().filter((m) => m.membership === "join" || m.membership === "invite").length ?? 0;
    if (!c.otherUserId || people > 2) return true;
    // A named group is never merged into a one-to-one conversation (an invite only shows the inviter so far).
    if (room && isNamedGroup(room)) return true;
    if (c.membership === "invite" && all.some((x) => x !== c && x.otherUserId === c.otherUserId && x.membership === "join")) return false;
    if (seen.has(c.otherUserId)) return false;
    // Prefer a joined room over an invite that sorted earlier.
    if (c.membership === "invite") {
      const joined = all.find((x) => x.otherUserId === c.otherUserId && x.membership === "join");
      if (joined) return false;
    }
    seen.add(c.otherUserId);
    return true;
  };
}

/**
 * Has someone else in the conversation read up to this message? (Matrix read receipts.)
 * Used for the "D" (delivered to the server) / "R" (read) marks on your own messages.
 */
export function readByOthers(client: MatrixClient, roomId: string, eventId: string): boolean {
  const room = client.getRoom(roomId);
  if (!room || !eventId.startsWith("$")) return false;
  const me = client.getUserId();
  return room.getJoinedMembers().some((m) => m.userId !== me && room.hasUserReadEvent(m.userId, eventId));
}

/** Other people currently typing in this conversation. */
export function typingMembers(client: MatrixClient, roomId: string): string[] {
  const me = client.getUserId();
  return (client.getRoom(roomId)?.currentState.getMembers() ?? []).filter((m) => m.typing && m.userId !== me).map((m) => m.name);
}

/** Newest displayable message without converting the whole timeline (cheap for the chat list). */
function lastMessage(client: MatrixClient, room: Room): ChatMessage | null {
  const pending = room.getPendingEvents();
  for (let i = pending.length - 1; i >= 0; i--) {
    const m = toChatMessage(client, pending[i]!);
    if (m) return m;
  }
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const m = toChatMessage(client, events[i]!);
    if (m) return m;
  }
  return null;
}

/** Resolve when a message satisfying `predicate` appears in `roomId`. Used by tests and UI flows. */
export function waitForMessage(
  client: MatrixClient,
  roomId: string,
  predicate: (m: ChatMessage) => boolean,
  timeoutMs = 20_000,
): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = roomMessages(client, roomId).find(predicate);
      if (found) {
        cleanup();
        resolve(found);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for message in ${roomId}`));
    }, timeoutMs);
    const onTimeline = () => check();
    const onDecrypted = () => check();
    const cleanup = () => {
      clearTimeout(timer);
      client.off(RoomEvent.Timeline, onTimeline);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    check();
  });
}

/** Resolve when `client` has a pending invite to (or has joined) `roomId`. */
export function waitForRoom(client: MatrixClient, roomId: string, timeoutMs = 20_000): Promise<Room> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const room = client.getRoom(roomId);
      if (room && ["invite", "join"].includes(room.getMyMembership())) {
        cleanup();
        resolve(room);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for room ${roomId}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      client.off(ClientEvent.Room, check);
      client.off(RoomEvent.MyMembership, check);
    };
    client.on(ClientEvent.Room, check);
    client.on(RoomEvent.MyMembership, check);
    check();
  });
}

export async function setTyping(client: MatrixClient, roomId: string, typing: boolean) {
  await client.sendTyping(roomId, typing, typing ? 5000 : 0);
}

export interface DeviceInfo {
  deviceId: string;
  displayName: string | null;
  lastSeenTs: number | null;
  isCurrent: boolean;
  verified: boolean | null;
}

export async function listDevices(client: MatrixClient): Promise<DeviceInfo[]> {
  const { devices } = await client.getDevices();
  const crypto = client.getCrypto();
  const userId = client.getSafeUserId();
  return Promise.all(
    devices.map(async (d) => {
      const status = crypto ? await crypto.getDeviceVerificationStatus(userId, d.device_id) : null;
      return {
        deviceId: d.device_id,
        displayName: d.display_name ?? null,
        lastSeenTs: d.last_seen_ts ?? null,
        isCurrent: d.device_id === client.getDeviceId(),
        verified: status ? status.crossSigningVerified : null,
      };
    }),
  );
}

/** Revoke (sign out) another device. Requires the account password (user-interactive auth). */
export async function revokeDevice(client: MatrixClient, deviceId: string, password: string): Promise<void> {
  const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: client.getSafeUserId() }, password };
  try {
    await client.deleteDevice(deviceId);
  } catch (err) {
    const session = (err as { data?: { session?: string } }).data?.session;
    if (!session) throw err;
    await client.deleteDevice(deviceId, { ...auth, session });
  }
}

/** Sign this device out and wipe its local crypto store. */
export async function signOut(client: MatrixClient): Promise<void> {
  try {
    await client.logout(true);
  } finally {
    client.stopClient();
    await client.clearStores();
  }
}

export type { MatrixClient } from "matrix-js-sdk";

/** Export this device's message keys as an encrypted file (standard Matrix key-export format). */
export async function exportKeysToFile(client: MatrixClient, passphrase: string): Promise<string> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("Crypto not initialised");
  const { encryptKeyExport } = await import("./keyExport");
  return encryptKeyExport(await crypto.exportRoomKeysAsJson(), passphrase);
}

/** Import message keys from a backup file; earlier messages become readable on this device. */
export async function importKeysFromFile(client: MatrixClient, file: string, passphrase: string): Promise<number> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("Crypto not initialised");
  const { decryptKeyExport } = await import("./keyExport");
  const json = await decryptKeyExport(file, passphrase);
  await crypto.importRoomKeysAsJson(json);
  return (JSON.parse(json) as unknown[]).length;
}
