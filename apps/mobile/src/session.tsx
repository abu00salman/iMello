import { ImelloApiClient, normalizePin, type Me } from "@imello/core";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";

/**
 * Mobile session. The homeserver access token is stored in the iOS Keychain /
 * Android Keystore via expo-secure-store (WHEN_UNLOCKED_THIS_DEVICE_ONLY: never
 * synced to iCloud/backups, unavailable while the device is locked).
 *
 * Encrypted messaging is NOT enabled on mobile yet: it requires the native
 * matrix-rust-sdk crypto bindings (see docs/ARCHITECTURE.md §Mobile crypto).
 * Account, contacts, invites and guardian controls are fully functional.
 */

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:8787";
const SESSION_KEY = "imello.session.v1";
/** "Start now" accounts: random password known only to this device until the user protects the account. */
const DEVICE_SECRET_KEY = "imello.deviceSecret.v1";
const STORE_OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

interface StoredSession {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
}

interface SessionState {
  status: "loading" | "signedOut" | "ready";
  api: ImelloApiClient;
  me: Me | null;
  session: StoredSession | null;
  signIn: (username: string, password: string) => Promise<void>;
  register: (input: { username: string; password: string; displayName: string; locale: "en" | "ar" }) => Promise<void>;
  quickStart: (displayName: string, locale: "en" | "ar") => Promise<void>;
  protectAccount: (newPassword: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useRef(new ImelloApiClient(API_URL)).current;
  const [status, setStatus] = useState<SessionState["status"]>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);

  const activate = useCallback(
    async (s: StoredSession) => {
      api.setAccessToken(s.accessToken);
      setMe(await api.me());
      setSession(s);
      setStatus("ready");
    },
    [api],
  );

  useEffect(() => {
    (async () => {
      const raw = await SecureStore.getItemAsync(SESSION_KEY, STORE_OPTS);
      if (!raw) return setStatus("signedOut");
      try {
        await activate(JSON.parse(raw) as StoredSession);
      } catch {
        await SecureStore.deleteItemAsync(SESSION_KEY, STORE_OPTS);
        setStatus("signedOut");
      }
    })();
  }, [activate]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const { homeserverUrl } = await api.config();
      username = normalizePin(username) ?? username;
      const res = await fetch(`${homeserverUrl}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: username.trim().toLowerCase() },
          password,
          initial_device_display_name: `iMello ${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "App"}`,
        }),
      });
      const body = (await res.json()) as { user_id?: string; access_token?: string; device_id?: string; errcode?: string };
      if (!res.ok || !body.access_token || !body.user_id || !body.device_id) throw new Error(body.errcode ?? "login_failed");
      const s = { homeserverUrl, userId: body.user_id, accessToken: body.access_token, deviceId: body.device_id };
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s), STORE_OPTS);
      await activate(s);
    },
    [api, activate],
  );

  const register = useCallback<SessionState["register"]>(
    async (input) => {
      await api.register(input);
      await signIn(input.username, input.password);
    },
    [api, signIn],
  );

  const quickStart = useCallback<SessionState["quickStart"]>(
    async (displayName, locale) => {
      const secret = base64url(Crypto.getRandomBytes(32));
      const { pin } = await api.quickStart({ deviceSecret: secret, displayName: displayName.trim() || undefined, locale });
      await SecureStore.setItemAsync(DEVICE_SECRET_KEY, secret, STORE_OPTS);
      await signIn(pin, secret);
    },
    [api, signIn],
  );

  const protectAccount = useCallback(
    async (newPassword: string) => {
      if (!session) throw new Error("not signed in");
      const secret = await SecureStore.getItemAsync(DEVICE_SECRET_KEY, STORE_OPTS);
      if (!secret) throw new Error("no device secret");
      const url = `${session.homeserverUrl}/_matrix/client/v3/account/password`;
      const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: session.userId }, password: secret };
      const post = (body: unknown) =>
        fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      let res = await post({ new_password: newPassword, logout_devices: false, auth });
      if (res.status === 401) {
        // User-interactive auth: repeat inside the session the server opened.
        const { session: uiaSession } = (await res.json()) as { session?: string };
        res = await post({ new_password: newPassword, logout_devices: false, auth: { ...auth, session: uiaSession } });
      }
      if (!res.ok) throw new Error(`password_change_failed_${res.status}`);
      setMe(await api.markProtected());
      await SecureStore.deleteItemAsync(DEVICE_SECRET_KEY, STORE_OPTS);
    },
    [api, session],
  );

  const refreshMe = useCallback(async () => setMe(await api.me()), [api]);

  const signOut = useCallback(async () => {
    if (session) {
      await fetch(`${session.homeserverUrl}/_matrix/client/v3/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
    }
    await SecureStore.deleteItemAsync(SESSION_KEY, STORE_OPTS);
    await SecureStore.deleteItemAsync(DEVICE_SECRET_KEY, STORE_OPTS);
    api.setAccessToken(null);
    setSession(null);
    setMe(null);
    setStatus("signedOut");
  }, [api, session]);

  return (
    <Ctx.Provider value={{ status, api, me, session, signIn, register, quickStart, protectAccount, refreshMe, signOut }}>{children}</Ctx.Provider>
  );
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
