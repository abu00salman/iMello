import { ImelloApiClient, type Me } from "@imello/core";
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
  signOut: () => Promise<void>;
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

  const signOut = useCallback(async () => {
    if (session) {
      await fetch(`${session.homeserverUrl}/_matrix/client/v3/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
    }
    await SecureStore.deleteItemAsync(SESSION_KEY, STORE_OPTS);
    api.setAccessToken(null);
    setSession(null);
    setMe(null);
    setStatus("signedOut");
  }, [api, session]);

  return <Ctx.Provider value={{ status, api, me, session, signIn, register, signOut }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
