import { ApiError, ImelloApiClient, normalizePin, type Me } from "@imello/core";
import { disableBackgroundPush } from "./push";
import {
  configureSdkLogging,
  loginWithPassword,
  signOut as matrixSignOut,
  startSecureClient,
  type MatrixClient,
  type Session,
} from "@imello/core/messaging";
import {
  ClientEvent,
  HttpApiEvent,
  MatrixEventEvent,
  RoomEvent,
  RoomMemberEvent,
} from "matrix-js-sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearDeviceSecret,
  cryptoDbPrefix,
  cryptoStorageKey,
  generateDeviceSecret,
  loadDeviceSecret,
  loadSession,
  saveDeviceSecret,
  saveSession,
  wipeAll,
} from "./keystore";

configureSdkLogging(import.meta.env.DEV ? "warn" : "error");

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type Status = "loading" | "signedOut" | "ready" | "offline";

interface SessionState {
  status: Status;
  client: MatrixClient | null;
  api: ImelloApiClient;
  me: Me | null;
  temporary: boolean;
  notice: string | null;
  signIn: (username: string, password: string, temporary: boolean) => Promise<void>;
  register: (input: { username: string; password: string; displayName: string; locale: "en" | "ar" }, temporary: boolean) => Promise<void>;
  /** "Start now": create an account with a generated iMello number, no password needed. */
  quickStart: (displayName: string, locale: "en" | "ar") => Promise<void>;
  /** Replace the device-only secret with a password the user chooses. */
  protectAccount: (newPassword: string) => Promise<void>;
  /** The account password if this device holds it (unprotected "Start now" accounts), else null. */
  deviceSecret: () => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Try the saved session again after a failed or timed-out boot. */
  retry: () => void;
  /** Called after the account was deleted/deactivated: wipe locally without contacting the server. */
  forget: (notice?: string) => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return `iMello Web · ${browser}${os ? ` on ${os}` : ""}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef(new ImelloApiClient(API_URL));
  const [status, setStatus] = useState<Status>("loading");
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [temporary, setTemporary] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const clientRef = useRef<MatrixClient | null>(null);

  const forget = useCallback(async (msg?: string) => {
    const c = clientRef.current;
    clientRef.current = null;
    c?.stopClient();
    await c?.clearStores().catch(() => undefined);
    await wipeAll();
    apiRef.current.setAccessToken(null);
    setClient(null);
    setMe(null);
    setNotice(msg ?? null);
    try { localStorage.removeItem("imello.returning"); } catch { /* ignore */ }
    setStatus("signedOut");
  }, []);

  const start = useCallback(
    async (session: Session, isTemporary: boolean, password?: string) => {
      const cryptoStore = isTemporary
        ? ({ kind: "memory" } as const)
        : ({
            kind: "indexeddb",
            prefix: cryptoDbPrefix(session.userId, session.deviceId),
            storageKey: await cryptoStorageKey(session.userId, session.deviceId),
          } as const);
      const c = await startSecureClient({ session, cryptoStore, passwordForCrossSigningSetup: password });
      c.on(HttpApiEvent.SessionLoggedOut, () => void forget("This device was signed out."));
      apiRef.current.setAccessToken(session.accessToken);
      let profile: Me;
      try {
        profile = await apiRef.current.me();
      } catch (err) {
        c.stopClient(); // don't leak a running client on each failed attempt
        throw err;
      }
      clientRef.current = c;
      setClient(c);
      setMe(profile);
      setTemporary(isTemporary);
      setNotice(null);
      // Lets the landing page send returning users straight to the app.
      if (!isTemporary) try { localStorage.setItem("imello.returning", "1"); } catch { /* ignore */ }
      setStatus("ready");
    },
    [forget],
  );

  // One in-flight restore. Retry waits on it instead of starting a second client.
  const inflight = useRef<Promise<void> | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  // Restore a persisted session on load. Each attempt is bounded so a hung IndexedDB
  // call, crypto download, or homeserver cannot leave the splash spinning with no way out.
  // Failures keep retrying on their own (a saved account must come back when the server does)
  // and never fall through to the sign-up screen.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const authError = (err: unknown) => {
      const code = (err as { httpStatus?: number; status?: number }).httpStatus ?? (err as ApiError).status;
      return code === 401 || code === 403;
    };
    const again = (n: number) => {
      const wait = Math.min(15_000, 1_500 * 2 ** Math.min(n, 4));
      timer = setTimeout(() => void run(n + 1), wait);
    };
    const run = async (n: number) => {
      if (cancelled || statusRef.current === "ready" || statusRef.current === "signedOut") return;
      if (n === 0) setStatus("loading");
      let session: Awaited<ReturnType<typeof loadSession>>;
      try {
        session = await withTimeout(loadSession(), 8_000);
      } catch (err) {
        if (cancelled) return;
        if (authError(err)) return void forget("This device was signed out.");
        setStatus("offline");
        again(n);
        return;
      }
      if (cancelled) return;
      if (!session) return setStatus("signedOut");
      try {
        if (!inflight.current) {
          const pending = start(session, false).finally(() => {
            inflight.current = null;
          });
          inflight.current = pending;
        }
        await withTimeout(inflight.current, 18_000);
      } catch (err) {
        if (cancelled) return;
        if (authError(err)) return void forget("This device was signed out.");
        setStatus("offline");
        again(n);
      }
    };
    void run(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [start, forget, bootNonce]);

  // Temporary sessions: sign the device out when the tab closes.
  useEffect(() => {
    if (!temporary || !client) return;
    const onHide = () => {
      const token = client.getAccessToken();
      if (!token) return;
      void fetch(`${client.baseUrl}/_matrix/client/v3/logout`, {
        method: "POST",
        keepalive: true,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: "{}",
      });
    };
    addEventListener("pagehide", onHide);
    return () => removeEventListener("pagehide", onHide);
  }, [temporary, client]);

  const signIn = useCallback(
    async (username: string, password: string, isTemporary: boolean) => {
      const { homeserverUrl } = await apiRef.current.config();
      // Accept an iMello number in any common spelling (mell-447729, 447729, MELL 447 729, Arabic digits).
      const user = normalizePin(username) ?? username.trim().toLowerCase();
      const session = await loginWithPassword(homeserverUrl, user, password, deviceName() + (isTemporary ? " (temporary)" : ""));
      if (!isTemporary) await saveSession(session);
      await start(session, isTemporary, password);
    },
    [start],
  );

  const register = useCallback<SessionState["register"]>(
    async (input, isTemporary) => {
      await apiRef.current.register(input);
      await signIn(input.username, input.password, isTemporary);
    },
    [signIn],
  );

  const quickStart = useCallback<SessionState["quickStart"]>(
    async (displayName, locale) => {
      const secret = generateDeviceSecret();
      const { pin, homeserverUrl } = await apiRef.current.quickStart({ deviceSecret: secret, displayName: displayName.trim() || undefined, locale });
      const session = await loginWithPassword(homeserverUrl, pin, secret, deviceName());
      await saveSession(session);
      await saveDeviceSecret(session.userId, secret);
      await start(session, false, secret);
    },
    [start],
  );

  const deviceSecret = useCallback(async () => {
    const userId = clientRef.current?.getUserId();
    return userId ? loadDeviceSecret(userId) : null;
  }, []);

  const protectAccount = useCallback(async (newPassword: string) => {
    const c = clientRef.current;
    if (!c) throw new Error("not signed in");
    const secret = await loadDeviceSecret(c.getSafeUserId());
    if (!secret) throw new Error("no device secret");
    const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: c.getSafeUserId() }, password: secret };
    try {
      await c.setPassword(auth as never, newPassword, false);
    } catch (err) {
      // User-interactive auth: retry inside the session the server opened.
      const session = (err as { data?: { session?: string } }).data?.session;
      if (!session) throw err;
      await c.setPassword({ ...auth, session } as never, newPassword, false);
    }
    setMe(await apiRef.current.markProtected());
    await clearDeviceSecret(c.getSafeUserId());
  }, []);

  const signOut = useCallback(async () => {
    const c = clientRef.current;
    await disableBackgroundPush(c, apiRef.current).catch(() => undefined);
    if (c) await matrixSignOut(c).catch(() => undefined);
    await forget();
  }, [forget]);

  const refreshMe = useCallback(async () => setMe(await apiRef.current.me()), []);

  return (
    <SessionContext.Provider
      value={{ status, client, api: apiRef.current, me, temporary, notice, signIn, register, quickStart, protectAccount, deviceSecret, signOut, refreshMe, forget, retry: () => setBootNonce((n) => n + 1) }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** Re-render when anything relevant changes in the Matrix client (batched per animation frame). */
export function useClientVersion(client: MatrixClient | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!client) return;
    // Coalesce bursts (initial sync, decrypting hundreds of events, typing) into at most one
    // re-render per 120 ms. Re-rendering every animation frame during a burst was the main cause of
    // freezes: each frame redrew whole conversations (measured: 35 long tasks for 40 incoming messages).
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    let last = 0;
    const bump = () => {
      if (timer) return;
      const wait = Math.max(0, 120 - (Date.now() - last));
      timer = setTimeout(() => {
        timer = 0;
        last = Date.now();
        setVersion((v) => v + 1);
      }, wait);
    };
    const events = [
      RoomEvent.Timeline, RoomEvent.LocalEchoUpdated, RoomEvent.MyMembership, RoomEvent.Name, RoomEvent.Receipt,
      ClientEvent.Room, ClientEvent.AccountData, ClientEvent.Sync, MatrixEventEvent.Decrypted, RoomMemberEvent.Typing,
    ] as const;
    // The SDK's typed emitter cannot express a heterogeneous list of events; the handler ignores arguments.
    const emitter = client as unknown as { on(e: string, f: () => void): void; off(e: string, f: () => void): void };
    for (const e of events) emitter.on(e, bump);
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of events) emitter.off(e, bump);
    };
  }, [client]);
  return version;
}
