/**
 * One-to-one voice and video calls (Matrix VoIP over WebRTC).
 *
 * - Call setup (offer/answer/ICE candidates) is sent as events in the conversation, which is
 *   end-to-end encrypted with Megolm, so the server never sees the session descriptions.
 * - Audio/video flows directly between the two devices, encrypted by WebRTC (DTLS-SRTP).
 * - NAT traversal uses a public STUN server. Without a TURN relay, calls between some networks
 *   (e.g. strict mobile-carrier NATs) can fail to connect; see docs/KNOWN_LIMITATIONS.md.
 */
import { CallEvent, createNewMatrixCall, type MatrixCall, type MatrixClient } from "matrix-js-sdk";
import { CallErrorCode, CallState, CallType } from "matrix-js-sdk/lib/webrtc/call.js";

export { CallErrorCode, CallEvent, CallState, CallType };
export type { MatrixCall };

/** Public STUN only (no relay): reveals each side's public IP to the STUN operator and the peer. */
export const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

/** Use our STUN server when the homeserver provides no TURN configuration. */
export function configureIce(client: MatrixClient, servers = DEFAULT_ICE_SERVERS): void {
  const c = client as unknown as { turnServers: { urls: string[] }[] };
  if (!client.getTurnServers().length) c.turnServers = servers;
}

export function callsSupported(client: MatrixClient): boolean {
  return client.supportsVoip();
}

export async function startVoiceCall(client: MatrixClient, roomId: string): Promise<MatrixCall> {
  configureIce(client);
  const call = createNewMatrixCall(client, roomId);
  if (!call) throw new Error("Calls are not supported on this device");
  await call.placeVoiceCall();
  return call;
}

export async function startVideoCall(client: MatrixClient, roomId: string): Promise<MatrixCall> {
  configureIce(client);
  const call = createNewMatrixCall(client, roomId);
  if (!call) throw new Error("Calls are not supported on this device");
  await call.placeVideoCall();
  return call;
}

/** True for video calls — including incoming ones before any media flows (read from the offer). */
export function isVideoCall(call: MatrixCall): boolean {
  if (call.type === CallType.Video) return true;
  const sdp = call.peerConn?.remoteDescription?.sdp ?? call.peerConn?.localDescription?.sdp ?? "";
  return /\bm=video [1-9]/.test(sdp);
}

/** The other person in a one-to-one conversation (joined or invited), if any. */
export function otherMemberId(client: MatrixClient, roomId: string): string | null {
  const me = client.getUserId();
  const room = client.getRoom(roomId);
  const m = room?.getMembers().find((x) => x.userId !== me && (x.membership === "join" || x.membership === "invite"));
  return m?.userId ?? null;
}

/** Switch to the next camera (front ↔ back on phones). Returns false when there is only one. */
export async function switchCamera(client: MatrixClient, call: MatrixCall): Promise<boolean> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId);
  if (cams.length < 2) return false;
  const handler = client.getMediaHandler() as unknown as { videoInput?: string; setVideoInput(id: string): Promise<void> };
  const active = handler.videoInput ?? call.localUsermediaStream?.getVideoTracks()[0]?.getSettings().deviceId;
  const current = cams.findIndex((c) => c.deviceId === active);
  await handler.setVideoInput(cams[(current + 1) % cams.length]!.deviceId);
  return true;
}

/** Subscribe to incoming calls. Returns an unsubscribe function. */
export function onIncomingCall(client: MatrixClient, handler: (call: MatrixCall) => void): () => void {
  configureIce(client);
  const emitter = client as unknown as { on(e: string, f: (c: MatrixCall) => void): void; off(e: string, f: (c: MatrixCall) => void): void };
  emitter.on("Call.incoming", handler);
  return () => emitter.off("Call.incoming", handler);
}
