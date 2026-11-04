import type { Receipt } from "./format";

export type AttachmentKind = "image" | "video" | "audio" | "file";

export interface WireMessage {
  id: string;
  txnId: string | null;
  roomId: string;
  sender: string;
  senderName: string;
  body: string | null;
  timestamp: number;
  isOwn: boolean;
  decryptionFailed: boolean;
  receipt: Receipt | null;
  ping: boolean;
  attachment: {
    kind: AttachmentKind;
    name: string;
    mimetype: string;
    size: number;
    voice: boolean;
    durationMs: number | null;
  } | null;
}

export interface WireRoom {
  roomId: string;
  name: string;
  membership: string;
  otherUserId: string | null;
  lastActivity: number;
  unread: number;
  typing: string[];
  last: {
    own: boolean;
    ping: boolean;
    failed: boolean;
    body: string | null;
    voice: boolean;
    kind: "text" | "image" | "audio" | "file" | "video" | "none";
    receipt: Receipt | null;
  } | null;
}

export interface SessionInfo {
  status: "ready" | "signedOut";
  userId?: string;
  deviceId?: string;
  accessToken?: string;
  homeserverUrl?: string;
  temporary?: boolean;
}

export interface EngineStatus {
  availability: "available" | "busy";
  message: string;
}

export interface DeviceRow {
  deviceId: string;
  displayName: string | null;
  lastSeenTs: number | null;
  isCurrent: boolean;
}
