/**
 * On-device backup of message keys ("Megolm session export").
 *
 * Implements the standard Matrix key-export file format used by Element and other clients
 * (https://spec.matrix.org — "Key exports"), so backups are interoperable:
 *   PBKDF2-SHA-512 (passphrase, random 16-byte salt, 500 000 iterations) → 64 bytes
 *     = AES-256-CTR key ‖ HMAC-SHA-256 key
 *   payload = 0x01 ‖ salt ‖ iv ‖ iterations(u32 BE) ‖ AES-CTR(json) ‖ HMAC-SHA-256(all before)
 *   armoured as base64 between "-----BEGIN MEGOLM SESSION DATA-----" lines.
 *
 * The file never leaves the device unless the user moves it. iMello does not upload backups.
 */
const HEADER = "-----BEGIN MEGOLM SESSION DATA-----";
const FOOTER = "-----END MEGOLM SESSION DATA-----";
export const KEY_EXPORT_ITERATIONS = 500_000;

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

async function deriveKeys(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await subtle().importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(
    await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-512", salt: salt as BufferSource, iterations }, base, 512),
  );
  const aes = await subtle().importKey("raw", bits.slice(0, 32), { name: "AES-CTR" }, false, ["encrypt", "decrypt"]);
  const hmac = await subtle().importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return { aes, hmac };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("wrong passphrase or damaged backup file");
    this.name = "WrongPassphraseError";
  }
}

export async function encryptKeyExport(json: string, passphrase: string, iterations = KEY_EXPORT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  iv[8]! &= 0x7f; // per format: leave room for the counter so it never wraps
  const { aes, hmac } = await deriveKeys(passphrase, salt, iterations);
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: "AES-CTR", counter: iv, length: 64 }, aes, enc.encode(json)),
  );
  const body = new Uint8Array(1 + 16 + 16 + 4 + ciphertext.length);
  body[0] = 1;
  body.set(salt, 1);
  body.set(iv, 17);
  new DataView(body.buffer).setUint32(33, iterations);
  body.set(ciphertext, 37);
  const mac = new Uint8Array(await subtle().sign("HMAC", hmac, body));
  const all = new Uint8Array(body.length + 32);
  all.set(body);
  all.set(mac, body.length);
  const b64 = toBase64(all).replace(/(.{96})/g, "$1\n").trim();
  return `${HEADER}\n${b64}\n${FOOTER}\n`;
}

export async function decryptKeyExport(file: string, passphrase: string): Promise<string> {
  const start = file.indexOf(HEADER);
  const end = file.indexOf(FOOTER);
  if (start < 0 || end < 0) throw new WrongPassphraseError();
  const data = fromBase64(file.slice(start + HEADER.length, end).replace(/\s+/g, ""));
  if (data.length < 1 + 16 + 16 + 4 + 32 || data[0] !== 1) throw new WrongPassphraseError();
  const salt = data.slice(1, 17);
  const iv = data.slice(17, 33);
  const iterations = new DataView(data.buffer, data.byteOffset).getUint32(33);
  if (iterations < 10_000 || iterations > 10_000_000) throw new WrongPassphraseError();
  const body = data.slice(0, data.length - 32);
  const mac = data.slice(data.length - 32);
  const { aes, hmac } = await deriveKeys(passphrase, salt, iterations);
  if (!(await subtle().verify("HMAC", hmac, mac, body))) throw new WrongPassphraseError();
  const plain = await subtle().decrypt({ name: "AES-CTR", counter: iv, length: 64 }, aes, body.slice(37));
  return dec.decode(plain);
}
