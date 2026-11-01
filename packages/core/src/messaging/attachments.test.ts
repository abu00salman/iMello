import { describe, expect, it } from "vitest";
import { attachmentKind, isDangerousFile, parseAttachment } from "./attachments";

const file = { url: "mxc://x/y", key: { kty: "oct", key_ops: ["encrypt", "decrypt"], alg: "A256CTR", k: "k", ext: true }, iv: "iv", v: "v2", hashes: { sha256: "h" } };

describe("attachments", () => {
  it("classifies kinds (SVG is never treated as an image)", () => {
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("image/svg+xml")).toBe("file");
    expect(attachmentKind("audio/mp4")).toBe("audio");
    expect(attachmentKind("application/pdf")).toBe("file");
  });
  it("flags dangerous files", () => {
    expect(isDangerousFile("setup.exe", "application/octet-stream")).toBe(true);
    expect(isDangerousFile("page.html", "text/html")).toBe(true);
    expect(isDangerousFile("photo.jpg", "image/jpeg")).toBe(false);
    expect(isDangerousFile("notes.pdf", "application/pdf")).toBe(false);
  });
  it("parses encrypted attachments and voice notes", () => {
    const a = parseAttachment({ msgtype: "m.audio", body: "v.webm", info: { mimetype: "audio/webm", size: 9, duration: 1500 }, file, "org.matrix.msc3245.voice": {} });
    expect(a).toMatchObject({ kind: "audio", voice: true, durationMs: 1500, size: 9 });
  });
  it("rejects unencrypted (plain url) attachments", () => {
    expect(parseAttachment({ msgtype: "m.image", body: "x.png", url: "mxc://x/y" })).toBeNull();
    expect(parseAttachment({ msgtype: "m.text", body: "hi" })).toBeNull();
  });
});
