import { describe, expect, it } from "vitest";
import { decryptKeyExport, encryptKeyExport, WrongPassphraseError } from "./keyExport";

describe("key export file", () => {
  const json = JSON.stringify([{ room_id: "!r:x", session_id: "s", session_key: "k", algorithm: "m.megolm.v1.aes-sha2" }]);

  it("round-trips with the right passphrase and uses the standard armour", async () => {
    const file = await encryptKeyExport(json, "correct horse", 10_000);
    expect(file.startsWith("-----BEGIN MEGOLM SESSION DATA-----\n")).toBe(true);
    expect(file).not.toContain("session_key");
    expect(await decryptKeyExport(file, "correct horse")).toBe(json);
  });

  it("rejects a wrong passphrase and tampered files", async () => {
    const file = await encryptKeyExport(json, "correct horse", 10_000);
    await expect(decryptKeyExport(file, "wrong")).rejects.toBeInstanceOf(WrongPassphraseError);
    const lines = file.split("\n");
    const mid = lines[1]!;
    lines[1] = mid.slice(0, 50) + (mid[50] === "A" ? "B" : "A") + mid.slice(51);
    await expect(decryptKeyExport(lines.join("\n"), "correct horse")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptKeyExport("garbage", "x")).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});
