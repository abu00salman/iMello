/**
 * Encrypted attachments (photos, files, voice messages).
 *
 * Uses Matrix's standard encrypted-file format (AES-256-CTR + SHA-256, spec "EncryptedFile" v2) via
 * matrix-org's matrix-encrypt-attachment library. The file is encrypted on the device before upload;
 * the homeserver stores only ciphertext. The per-file key travels inside the Megolm-encrypted message,
 * so only the conversation's members can decrypt it.
 */
import type { MatrixClient } from "matrix-js-sdk";
import { decryptAttachment, encryptAttachment, type IEncryptedFile } from "matrix-encrypt-attachment";

export type AttachmentKind = "image" | "video" | "audio" | "file";

export interface EncryptedFileRef extends IEncryptedFile {
  url: string;
  mimetype?: string;
}

export interface AttachmentInfo {
  kind: AttachmentKind;
  name: string;
  mimetype: string;
  size: number;
  file: EncryptedFileRef;
  voice: boolean;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

/** Kept modest for family use and mobile data; the homeserver allows more. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const DANGEROUS = /\.(exe|msi|bat|cmd|com|scr|pif|cpl|js|jse|vbs|vbe|wsf|ps1|psm1|jar|apk|app|dmg|pkg|deb|rpm|sh|command|html?|xhtml|svg|hta|lnk|reg|dll|iso|img)$/i;

/** Files that can run code or render active content. They are never opened automatically. */
export function isDangerousFile(name: string, mimetype: string): boolean {
  return DANGEROUS.test(name) || /html|javascript|svg|x-msdownload|x-sh|java-archive/i.test(mimetype);
}

export function attachmentKind(mimetype: string): AttachmentKind {
  if (mimetype.startsWith("image/") && !mimetype.includes("svg")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "file";
}

const MSGTYPE: Record<AttachmentKind, string> = { image: "m.image", video: "m.video", audio: "m.audio", file: "m.file" };

export class AttachmentTooLargeError extends Error {
  constructor() {
    super("attachment too large");
    this.name = "AttachmentTooLargeError";
  }
}

export interface SendAttachmentOptions {
  name: string;
  mimetype: string;
  voice?: boolean;
  durationMs?: number;
  width?: number;
  height?: number;
  txnId?: string;
  /** Called with upload progress 0..1 (if the platform reports it). */
  onProgress?: (fraction: number) => void;
}

/** Encrypt and send a file. Refuses rooms without encryption, like sendText(). */
export async function sendAttachment(
  client: MatrixClient,
  roomId: string,
  data: Blob,
  opts: SendAttachmentOptions,
): Promise<string> {
  const crypto = client.getCrypto();
  if (!crypto || !(await crypto.isEncryptionEnabledInRoom(roomId))) {
    throw new Error(`Refusing to send: encryption is not enabled in room ${roomId}`);
  }
  if (data.size > MAX_ATTACHMENT_BYTES) throw new AttachmentTooLargeError();

  const { data: ciphertext, info } = await encryptAttachment(await data.arrayBuffer());
  // The upload carries no filename or real content type: those are inside the encrypted event.
  const upload = await client.uploadContent(new Blob([ciphertext], { type: "application/octet-stream" }), {
    type: "application/octet-stream",
    includeFilename: false,
    progressHandler: ({ loaded, total }) => opts.onProgress?.(total ? loaded / total : 0),
  });

  const kind = opts.voice ? "audio" : attachmentKind(opts.mimetype);
  const content: Record<string, unknown> = {
    msgtype: MSGTYPE[kind],
    body: opts.name,
    info: {
      mimetype: opts.mimetype,
      size: data.size,
      ...(opts.durationMs ? { duration: Math.round(opts.durationMs) } : {}),
      ...(opts.width && opts.height ? { w: opts.width, h: opts.height } : {}),
    },
    file: { ...info, url: upload.content_uri, mimetype: opts.mimetype },
  };
  if (opts.voice) {
    // Widely supported markers for voice notes (MSC3245 / MSC1767).
    content["org.matrix.msc3245.voice"] = {};
    content["org.matrix.msc1767.audio"] = { duration: Math.round(opts.durationMs ?? 0) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.sendMessage(roomId, content as any, opts.txnId);
  return res.event_id;
}

/** Download (authenticated media) and decrypt an attachment. */
export async function downloadAttachment(client: MatrixClient, info: AttachmentInfo): Promise<Blob> {
  const httpUrl = client.mxcUrlToHttp(info.file.url, undefined, undefined, undefined, false, true, true);
  if (!httpUrl) throw new Error("invalid media url");
  const res = await fetch(httpUrl, { headers: { authorization: `Bearer ${client.getAccessToken()}` } });
  if (!res.ok) throw new Error(`media download failed (${res.status})`);
  const plaintext = await decryptAttachment(await res.arrayBuffer(), info.file);
  return new Blob([plaintext], { type: info.mimetype });
}

/** Read attachment details from a decrypted event's content, or null if it isn't an (encrypted) attachment. */
export function parseAttachment(content: Record<string, unknown>): AttachmentInfo | null {
  const msgtype = content.msgtype as string | undefined;
  const file = content.file as EncryptedFileRef | undefined;
  if (!msgtype || !["m.image", "m.video", "m.audio", "m.file"].includes(msgtype)) return null;
  // Only encrypted files are accepted; a plain `url` attachment would bypass end-to-end encryption.
  if (!file?.url || !file.key || !file.iv) return null;
  const info = (content.info ?? {}) as { mimetype?: string; size?: number; duration?: number; w?: number; h?: number };
  const mimetype = info.mimetype ?? file.mimetype ?? "application/octet-stream";
  const voice = "org.matrix.msc3245.voice" in content;
  return {
    kind: voice ? "audio" : (msgtype.slice(2) as AttachmentKind),
    name: typeof content.body === "string" ? content.body : "file",
    mimetype,
    size: info.size ?? 0,
    file,
    voice,
    durationMs: info.duration ?? null,
    width: info.w ?? null,
    height: info.h ?? null,
  };
}
