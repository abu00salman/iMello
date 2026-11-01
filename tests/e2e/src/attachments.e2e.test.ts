/** Encrypted photos, files and voice messages through the real homeserver. */
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  acceptInvite,
  downloadAttachment,
  sendAttachment,
  startDirectChat,
  waitForMessage,
  waitForRoom,
} from "@imello/core/messaging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, env, registerAdult, stopAll, type TestUser } from "./harness";

let a: TestUser;
let b: TestUser;
let roomId: string;
const marker = `PLAINTEXT-MARKER-${randomBytes(8).toString("hex")}`;

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await filesUnder(p)));
    else out.push(p);
  }
  return out;
}

beforeAll(async () => {
  [a, b] = await Promise.all([registerAdult("photoa"), registerAdult("photob")]);
  await connect(a, b);
  roomId = await startDirectChat(a.client, b.userId);
  await waitForRoom(b.client, roomId);
  await acceptInvite(b.client, roomId);
});
afterAll(stopAll);

describe("encrypted attachments", () => {
  it("a photo arrives and decrypts to the exact original bytes", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new TextEncoder().encode(marker), ...randomBytes(2048)]);
    await sendAttachment(a.client, roomId, new Blob([bytes], { type: "image/png" }), {
      name: "family.png", mimetype: "image/png", width: 640, height: 480,
    });
    const msg = await waitForMessage(b.client, roomId, (m) => m.attachment?.name === "family.png");
    expect(msg.encrypted).toBe(true);
    expect(msg.attachment).toMatchObject({ kind: "image", mimetype: "image/png", width: 640, height: 480, voice: false });
    const blob = await downloadAttachment(b.client, msg.attachment!);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("a voice message is marked as voice with its duration", async () => {
    const audio = new Blob([new TextEncoder().encode(marker), randomBytes(4096)], { type: "audio/webm" });
    await sendAttachment(a.client, roomId, audio, { name: "voice.webm", mimetype: "audio/webm", voice: true, durationMs: 3200 });
    const msg = await waitForMessage(b.client, roomId, (m) => m.attachment?.voice === true);
    expect(msg.attachment).toMatchObject({ kind: "audio", durationMs: 3200 });
    expect((await downloadAttachment(b.client, msg.attachment!)).size).toBe(audio.size);
  });

  it("a document keeps its name and type", async () => {
    const pdf = new Blob([`%PDF-1.4 ${marker}`], { type: "application/pdf" });
    await sendAttachment(a.client, roomId, pdf, { name: "schedule.pdf", mimetype: "application/pdf" });
    const msg = await waitForMessage(b.client, roomId, (m) => m.attachment?.name === "schedule.pdf");
    expect(msg.attachment?.kind).toBe("file");
    expect(await (await downloadAttachment(b.client, msg.attachment!)).text()).toContain(marker);
  });

  it("the homeserver's media store holds only ciphertext", async () => {
    const files = await filesUnder(join(env.stateDir, "synapse/media_store"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect((await readFile(f)).includes(Buffer.from(marker))).toBe(false);
  });

  it("without the key from the encrypted message, the file is unreadable", async () => {
    const outsider = await registerAdult("outsider");
    const msg = (await waitForMessage(b.client, roomId, (m) => m.attachment?.name === "schedule.pdf")).attachment!;
    const wrongKey = { ...msg, file: { ...msg.file, key: { ...msg.file.key, k: Buffer.from(randomBytes(32)).toString("base64url") } } };
    // AES-CTR does not detect a wrong key; it yields noise. (Integrity comes from the SHA-256 hash that
    // travels inside the Megolm-encrypted event, so it cannot be swapped by the server.)
    const garbage = await (await downloadAttachment(outsider.client, wrongKey)).text();
    expect(garbage).not.toContain(marker);
    expect(garbage).not.toContain("%PDF");
  });
});
