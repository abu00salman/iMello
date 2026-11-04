/**
 * Same at-rest model as the web client (docs/SECURITY.md):
 * the Matrix session and the crypto storage key are sealed with a non-extractable
 * AES-GCM key that lives in IndexedDB. Nothing secret is written to localStorage.
 * This copy runs only inside the invisible engine WebView.
 */
import type { Session } from "@imello/core/messaging";

const DB_NAME = "imello-keystore";
const STORE = "kv";
const WRAPPING_KEY = "wrapping-key";
const SESSION = "session";
export const CRYPTO_DB_PREFIX = "imello-crypto";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const get = <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
const put = (key: string, value: unknown) => tx("readwrite", (s) => s.put(value, key));
const del = (key: string) => tx("readwrite", (s) => s.delete(key));

async function wrappingKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(WRAPPING_KEY);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await put(WRAPPING_KEY, key);
  return key;
}

interface Sealed {
  iv: Uint8Array;
  data: ArrayBuffer;
}

async function seal(plain: Uint8Array, aad: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    await wrappingKey(),
    plain as BufferSource,
  );
  return { iv, data };
}

async function unseal(sealed: Sealed, aad: string): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.iv as BufferSource, additionalData: new TextEncoder().encode(aad) },
    await wrappingKey(),
    sealed.data,
  );
  return new Uint8Array(plain);
}

export async function cryptoStorageKey(userId: string, deviceId: string): Promise<Uint8Array> {
  const id = `storage-key:${userId}:${deviceId}`;
  const sealed = await get<Sealed>(id);
  if (sealed) return unseal(sealed, id);
  const key = crypto.getRandomValues(new Uint8Array(32));
  await put(id, await seal(key, id));
  return key;
}

export function cryptoDbPrefix(userId: string, deviceId: string): string {
  return `${CRYPTO_DB_PREFIX}:${userId}:${deviceId}`;
}

export async function saveSession(session: Session): Promise<void> {
  await put(SESSION, await seal(new TextEncoder().encode(JSON.stringify(session)), SESSION));
}

export async function loadSession(): Promise<Session | null> {
  const sealed = await get<Sealed>(SESSION);
  if (!sealed) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await unseal(sealed, SESSION))) as Session;
  } catch {
    return null;
  }
}

export async function saveDeviceSecret(userId: string, secret: string): Promise<void> {
  const id = `device-secret:${userId}`;
  await put(id, await seal(new TextEncoder().encode(secret), id));
}

export async function loadDeviceSecret(userId: string): Promise<string | null> {
  const id = `device-secret:${userId}`;
  const sealed = await get<Sealed>(id);
  if (!sealed) return null;
  return new TextDecoder().decode(await unseal(sealed, id));
}

export async function clearDeviceSecret(userId: string): Promise<void> {
  await del(`device-secret:${userId}`);
}

export async function wipeAll(): Promise<void> {
  await del(SESSION).catch(() => undefined);
  const dbs = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    dbs
      .map((d) => d.name)
      .filter((name): name is string => !!name && (name.startsWith(CRYPTO_DB_PREFIX) || name === DB_NAME || name.startsWith("matrix-js-sdk")))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
  );
}
