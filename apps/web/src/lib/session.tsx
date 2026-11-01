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

type Status = "loading" | "signedOut" | "ready";

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
      const profile = await apiRef.current.me();
      clientRef.current = c;
      setClient(c);
      setMe(profile);
      setTemporary(isTemporary);
      setNotice(null);
      setStatus("ready");
    },
    [forget],
  );

  // Restore a persisted session on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await loadSession();
      if (cancelled) return; // React StrictMode re-runs effects in development.
      if (!session) return setStatus("signedOut");
      try {
        await start(session, false);
      } catch (err) {
        const status = (err as { httpStatus?: number; status?: number }).httpStatus ?? (err as ApiError).status;
        if (status === 401 || status === 403) await forget("This device was signed out.");
        else {
          setNotice("Could not reach iMello. Check your connection and reload.");
          setStatus("signedOut");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, forget]);

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
      value={{ status, client, api: apiRef.current, me, temporary, notice, signIn, register, quickStart, protectAccount, deviceSecret, signOut, refreshMe, forget }}
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
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVersion((v) => v + 1);
      });
    };
    const events = [
      RoomEvent.Timeline, RoomEvent.LocalEchoUpdated, RoomEvent.MyMembership, RoomEvent.Name, RoomEvent.Receipt,
      ClientEvent.Room, ClientEvent.AccountData, ClientEvent.Sync, MatrixEventEvent.Decrypted, RoomMemberEvent.Typing,
    ] as const;
    // The SDK's typed emitter cannot express a heterogeneous list of events; the handler ignores arguments.
    const emitter = client as unknown as { on(e: string, f: () => void): void; off(e: string, f: () => void): void };
    for (const e of events) emitter.on(e, bump);
    return () => {
      cancelAnimationFrame(frame);
      for (const e of events) emitter.off(e, bump);
    };
  }, [client]);
  return version;
}
