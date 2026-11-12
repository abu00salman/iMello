/**
 * Call history and 24-hour status updates, built only from Matrix rooms the user is in.
 * Nothing here talks to a separate service: call events and status posts are ordinary
 * (end-to-end encrypted) room events, so the homeserver's contact policy applies to them.
 */
import { ClientEvent, EventType, MsgType, Preset, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";

// ── Call history ─────────────────────────────────────────────────────────

export interface CallRecord {
  callId: string;
  roomId: string;
  /** The other person (for one-to-one rooms). */
  otherUserId: string | null;
  outgoing: boolean;
  video: boolean;
  startedAt: number;
  answered: boolean;
  /** Seconds between answer and hang-up, when both are known. */
  durationSec: number | null;
}

/** Calls found in the loaded part of each conversation, newest first. */
export function callHistory(client: MatrixClient): CallRecord[] {
  const me = client.getUserId();
  const calls = new Map<string, CallRecord & { answeredAt?: number; endedAt?: number }>();
  for (const room of client.getRooms()) {
    if (room.getMyMembership() !== "join" || isStatusRoom(room)) continue;
    for (const ev of room.getLiveTimeline().getEvents()) {
      const type = ev.getType();
      if (type !== EventType.CallInvite && type !== EventType.CallAnswer && type !== EventType.CallHangup) continue;
      const c = ev.getContent() as { call_id?: string; offer?: { sdp?: string } };
      if (!c.call_id) continue;
      const key = `${room.roomId}|${c.call_id}`;
      if (type === EventType.CallInvite) {
        const other = room.getMembers().find((m) => m.userId !== me)?.userId ?? null;
        calls.set(key, {
          ...(calls.get(key) ?? {}),
          callId: c.call_id,
          roomId: room.roomId,
          otherUserId: other,
          outgoing: ev.getSender() === me,
          video: /m=video/.test(c.offer?.sdp ?? ""),
          startedAt: ev.getTs(),
          answered: calls.get(key)?.answered ?? false,
          durationSec: null,
        });
      } else {
        const rec = calls.get(key);
        if (!rec) continue;
        if (type === EventType.CallAnswer) { rec.answered = true; rec.answeredAt = ev.getTs(); }
        else rec.endedAt = ev.getTs();
      }
    }
  }
  return [...calls.values()]
    .map(({ answeredAt, endedAt, ...rec }) => ({ ...rec, durationSec: answeredAt && endedAt && endedAt > answeredAt ? Math.round((endedAt - answeredAt) / 1000) : null }))
    .sort((a, b) => b.startedAt - a.startedAt);
}

// ── Status updates (24 hours) ────────────────────────────────────────────

export const STATUS_ROOM_TYPE = "org.wanas.status";
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export function isStatusRoom(room: Room): boolean {
  return room.getType() === STATUS_ROOM_TYPE;
}

function myStatusRoom(client: MatrixClient): Room | null {
  const me = client.getUserId();
  return client.getRooms().find((r) => isStatusRoom(r) && r.getMyMembership() === "join" && r.getCreator() === me) ?? null;
}

/** People I have a joined one-to-one conversation with: my status audience. */
function audience(client: MatrixClient): string[] {
  const direct = (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
  return Object.entries(direct)
    .filter(([, rooms]) => rooms.some((id) => client.getRoom(id)?.getMyMembership() === "join"))
    .map(([user]) => user);
}

/** Create my encrypted status room if needed and make sure every current contact is invited. */
export async function ensureStatusRoom(client: MatrixClient): Promise<string> {
  let room = myStatusRoom(client);
  if (!room) {
    const { room_id } = await client.createRoom({
      preset: Preset.PrivateChat,
      name: "status",
      creation_content: { type: STATUS_ROOM_TYPE },
      initial_state: [
        { type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
        { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "shared" } },
        { type: EventType.RoomGuestAccess, state_key: "", content: { guest_access: "forbidden" } },
      ],
    });
    room = await waitFor(client, room_id);
  }
  const present = new Set(room.getMembers().filter((m) => m.membership === "join" || m.membership === "invite").map((m) => m.userId));
  const invited: string[] = [];
  for (const user of audience(client)) {
    // The homeserver's contact policy decides; a refused invite is skipped, not fatal.
    if (!present.has(user)) await client.invite(room.roomId, user).then(() => invited.push(user), () => undefined);
  }
  // Encryption keys go to the members this device knows about. Wait until new invites are in the
  // local room state, or the next post would be unreadable for them.
  const end = Date.now() + 10_000;
  const r = room;
  while (invited.some((u) => !["invite", "join"].includes(r.getMember(u)?.membership ?? "")) && Date.now() < end) {
    await new Promise((res) => setTimeout(res, 150));
  }
  return room.roomId;
}

/** Post a text status to my contacts. Visible for 24 hours. */
export async function postStatus(client: MatrixClient, text: string): Promise<void> {
  const body = text.trim().slice(0, 700);
  if (!body) throw new Error("empty_status");
  const roomId = await ensureStatusRoom(client);
  await client.sendMessage(roomId, { msgtype: MsgType.Text, body });
}

/** Accept status-room invitations from contacts (they are not chats, so nobody has to tap Accept). */
export async function acceptStatusInvites(client: MatrixClient): Promise<void> {
  for (const room of client.getRooms()) {
    if (room.getMyMembership() === "invite" && isStatusRoom(room)) await client.joinRoom(room.roomId).catch(() => undefined);
  }
}

export interface StatusPost {
  id: string;
  sender: string;
  body: string;
  timestamp: number;
  isOwn: boolean;
}

/** Status posts from the last 24 hours, grouped per person, newest person first. */
export function statusUpdates(client: MatrixClient, now = Date.now()): { userId: string; posts: StatusPost[] }[] {
  const me = client.getUserId();
  const byUser = new Map<string, StatusPost[]>();
  for (const room of client.getRooms()) {
    if (room.getMyMembership() !== "join" || !isStatusRoom(room)) continue;
    const owner = room.getCreator();
    for (const ev of room.getLiveTimeline().getEvents()) {
      if (ev.getType() !== EventType.RoomMessage || ev.isRedacted() || ev.isDecryptionFailure()) continue;
      if (ev.getSender() !== owner || now - ev.getTs() > STATUS_TTL_MS) continue;
      const body = ev.getContent().body;
      if (typeof body !== "string") continue;
      const list = byUser.get(owner!) ?? [];
      list.push({ id: ev.getId() ?? "", sender: owner!, body, timestamp: ev.getTs(), isOwn: owner === me });
      byUser.set(owner!, list);
    }
  }
  return [...byUser]
    .map(([userId, posts]) => ({ userId, posts: posts.sort((a, b) => a.timestamp - b.timestamp) }))
    .sort((a, b) => (a.userId === me ? -1 : b.userId === me ? 1 : b.posts.at(-1)!.timestamp - a.posts.at(-1)!.timestamp));
}

/** Delete my own posts older than 24 hours, so they don't stay on the server. */
export async function expireMyStatuses(client: MatrixClient, now = Date.now()): Promise<number> {
  const room = myStatusRoom(client);
  if (!room) return 0;
  const old = room.getLiveTimeline().getEvents().filter((ev: MatrixEvent) => ev.getType() === EventType.RoomMessage && !ev.isRedacted() && ev.getSender() === client.getUserId() && now - ev.getTs() > STATUS_TTL_MS);
  for (const ev of old) await client.redactEvent(room.roomId, ev.getId()!).catch(() => undefined);
  return old.length;
}

function waitFor(client: MatrixClient, roomId: string): Promise<Room> {
  const existing = client.getRoom(roomId);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const check = () => {
      const r = client.getRoom(roomId);
      if (r) { client.off(ClientEvent.Room, check); resolve(r); }
    };
    client.on(ClientEvent.Room, check);
  });
}
