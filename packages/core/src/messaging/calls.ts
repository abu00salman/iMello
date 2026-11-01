/**
 * One-to-one voice calls (Matrix VoIP over WebRTC).
 *
 * - Call setup (offer/answer/ICE candidates) is sent as events in the conversation, which is
 *   end-to-end encrypted with Megolm, so the server never sees the session descriptions.
 * - Audio flows directly between the two devices, encrypted by WebRTC (DTLS-SRTP).
 * - NAT traversal uses a public STUN server. Without a TURN relay, calls between some networks
 *   (e.g. strict mobile-carrier NATs) can fail to connect; see docs/KNOWN_LIMITATIONS.md.
 */
import { CallEvent, createNewMatrixCall, type MatrixCall, type MatrixClient } from "matrix-js-sdk";
import { CallErrorCode, CallState } from "matrix-js-sdk/lib/webrtc/call.js";

export { CallErrorCode, CallEvent, CallState };
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

/** Subscribe to incoming calls. Returns an unsubscribe function. */
export function onIncomingCall(client: MatrixClient, handler: (call: MatrixCall) => void): () => void {
  configureIce(client);
  const emitter = client as unknown as { on(e: string, f: (c: MatrixCall) => void): void; off(e: string, f: (c: MatrixCall) => void): void };
  emitter.on("Call.incoming", handler);
  return () => emitter.off("Call.incoming", handler);
}
