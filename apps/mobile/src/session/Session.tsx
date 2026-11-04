import { ApiError, ImelloApiClient, normalizePin, type Me } from "@imello/core";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import type { WebView } from "react-native-webview";
import { formatDiagnostics, stageExpired, type BootStage } from "../engine/diagnostics";
import { EngineView, type EngineAssetInfo } from "../engine/EngineView";
import { armSounds, playSound } from "../media/sounds";
import { usePrefs } from "../prefs/Prefs";
import { RpcClient, type RpcTransport } from "../rpc/client";
import { RpcError, parseRpcMessage } from "../rpc/protocol";
import type { DeviceRow, SessionInfo, WireMessage, WireRoom } from "../rpc/wire";

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "https://imello-api.abu00salman.com";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export type Phase = "booting" | "out" | "in" | "error";

interface Activity {
  roomId: string;
  eventId: string;
  senderName: string;
  ping: boolean;
  roomName: string;
  group?: boolean;
}

interface SessionApi {
  phase: Phase;
  me: Me | null;
  rooms: WireRoom[];
  messagesFor: (roomId: string) => WireMessage[];
  typingFor: (roomId: string) => string[];
  shakeToken: number;
  shakeRoom: string | null;
  notice: string | null;
  api: ImelloApiClient;
  refreshMe: () => Promise<void>;
  signIn: (username: string, password: string, temporary: boolean) => Promise<void>;
  register: (input: { username: string; password: string; displayName: string }, temporary: boolean) => Promise<void>;
  quickStart: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendText: (roomId: string, body: string) => Promise<void>;
  sendPing: (roomId: string) => Promise<{ eventId: string | null; retryAt: number }>;
  retry: (roomId: string, id: string) => Promise<void>;
  sendFile: (roomId: string, file: { name: string; mimetype: string; base64: string; voice?: boolean; durationMs?: number }) => Promise<void>;
  downloadFile: (roomId: string, eventId: string) => Promise<{ base64: string; mimetype: string; name: string }>;
  markRead: (roomId: string) => Promise<void>;
  setTyping: (roomId: string, typing: boolean) => Promise<void>;
  watch: (roomId: string | null) => void;
  openDirect: (userId: string) => Promise<string>;
  acceptInvite: (roomId: string) => Promise<void>;
  exportKeys: (passphrase: string) => Promise<string>;
  importKeys: (file: string, passphrase: string) => Promise<number>;
  devices: () => Promise<DeviceRow[]>;
  revokeDevice: (deviceId: string, password?: string) => Promise<void>;
  protect: (password: string) => Promise<void>;
  bootStage: string;
  bootError: string | null;
  logs: string[];
  diagnostics: string;
  retryBoot: () => void;
}

const Ctx = createContext<SessionApi | null>(null);

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const api = useMemo(() => new ImelloApiClient(API_URL), []);
  const webRef = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);
  const listeners = useRef(new Set<(raw: string) => void>());
  const transport = useMemo<RpcTransport>(
    () => ({
      send(json) {
        const script = `window.__imelloReceive&&window.__imelloReceive(${JSON.stringify(json)});true;`;
        if (ready.current && webRef.current) webRef.current.injectJavaScript(script);
        else queue.current.push(script);
      },
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [],
  );
  const rpc = useMemo(() => new RpcClient(transport, 45_000), [transport]);
  const [phase, setPhase] = useState<Phase>("booting");
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<WireRoom[]>([]);
  const [timelines, setTimelines] = useState<Record<string, WireMessage[]>>({});
  const [shake, setShake] = useState<{ room: string | null; token: number }>({ room: null, token: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [bootStage, setBootStage] = useState<BootStage>("asset");
  const [bootError, setBootError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [assetInfo, setAssetInfo] = useState<EngineAssetInfo | null>(null);
  const bootRef = useRef({ stage: "asset" as BootStage, started: Date.now(), settled: false });
  const active = useRef<string | null>(null);
  const roomsRef = useRef<WireRoom[]>([]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  roomsRef.current = rooms;

  const noteLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-39), line]);
  }, []);

  const failBoot = useCallback((message: string) => {
    if (bootRef.current.settled) return;
    bootRef.current.settled = true;
    setBootError(message);
    setPhase("error");
  }, []);

  const advance = useCallback((stage: BootStage) => {
    if (bootRef.current.settled) return;
    const order: BootStage[] = ["asset", "webview", "hello", "session"];
    if (order.indexOf(stage) <= order.indexOf(bootRef.current.stage)) return;
    bootRef.current = { stage, started: Date.now(), settled: false };
    setBootStage(stage);
  }, []);

  const settle = useCallback(() => {
    bootRef.current.settled = true;
  }, []);

  const onAsset = useCallback((info: EngineAssetInfo) => {
    setAssetInfo(info);
    noteLog(`asset ${info.bytes} bytes`);
    advance("webview");
  }, [advance, noteLog]);

  const onLoaded = useCallback(() => {
    noteLog("webview loaded");
    advance("hello");
  }, [advance, noteLog]);

  const onEngineMessage = useCallback((raw: string) => {
    const msg = parseRpcMessage(raw);
    if (msg?.kind === "evt" && msg.event === "hello") {
      ready.current = true;
      const pending = queue.current;
      queue.current = [];
      for (const script of pending) webRef.current?.injectJavaScript(script);
    }
    for (const listener of listeners.current) listener(raw);
  }, []);

  const refreshMe = useCallback(async () => {
    setMe(await api.me());
  }, [api]);

  useEffect(() => {
    void armSounds().catch(() => undefined);
    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync("messages", { name: "Messages", importance: Notifications.AndroidImportance.HIGH, sound: "incoming.wav" });
    }
    const opened = Notifications.addNotificationResponseReceivedListener((res) => {
      const roomId = res.notification.request.content.data?.roomId;
      if (typeof roomId === "string") router.push(`/chat/${encodeURIComponent(roomId)}`);
    });
    return () => opened.remove();
  }, []);

  useEffect(() => {
    const offSession = rpc.on("session", (data) => {
      const info = data as SessionInfo;
      settle();
      if (info.status === "signedOut") {
        api.setAccessToken(null);
        setMe(null);
        setRooms([]);
        setPhase("out");
        void rpc.call("ack").catch(() => undefined);
        return;
      }
      api.setAccessToken(info.accessToken ?? null);
      setPhase("in");
      void rpc.call("ack").catch(() => undefined);
      void api.me().then(setMe).catch((err: unknown) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) void rpc.call("signOut");
      });
    });
    const offRooms = rpc.on("rooms", (data) => setRooms((data as WireRoom[]) ?? []));
    const offTimeline = rpc.on("timeline", (data) => {
      const payload = data as { roomId: string; messages: WireMessage[] };
      setTimelines((prev) => ({ ...prev, [payload.roomId]: payload.messages }));
    });
    const offHello = rpc.on("hello", () => {
      advance("session");
      void rpc.call("ack").catch(() => undefined);
    });
    const offLog = rpc.on("log", (data) => {
      const row = data as { level?: string; message?: string };
      noteLog(`${row.level ?? "log"}: ${(row.message ?? "").slice(0, 400)}`);
    });
    const offError = rpc.on("engine-error", (data) => {
      const body = data as { message?: string; code?: string };
      failBoot(body?.message || body?.code || "engine-error");
    });
    const offActivity = rpc.on("activity", (data) => {
      const activity = data as Activity;
      const here = AppState.currentState === "active" && active.current === activity.roomId;
      const soundsOn = prefsRef.current.sounds;
      if (activity.ping) {
        setShake((s) => ({ room: activity.roomId, token: s.token + 1 }));
        if (soundsOn) playSound("ping");
      } else if (here) {
        if (soundsOn) playSound("tick");
      } else if (soundsOn) {
        playSound(activity.group ? "group" : "incoming");
      }
      if (!here) {
        const room = roomsRef.current.find((r) => r.roomId === activity.roomId);
        const preview = prefsRef.current.preview ? (room?.last?.body ?? "") : "";
        void Notifications.scheduleNotificationAsync({
          content: {
            title: activity.ping ? prefsRef.current.t("pingWord") : activity.senderName || activity.roomName,
            body: activity.ping ? prefsRef.current.t("pingFrom", { name: activity.senderName }) : preview,
            data: { roomId: activity.roomId },
            sound: soundsOn ? "incoming.wav" : undefined,
          },
          trigger: Platform.OS === "android" ? { channelId: "messages" } : null,
        });
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void rpc.call("resume").catch(() => undefined);
    });
    return () => {
      offSession();
      offRooms();
      offTimeline();
      offHello();
      offError();
      offLog();
      offActivity();
      sub.remove();
    };
  }, [advance, api, failBoot, noteLog, rpc, settle]);

  useEffect(() => {
    bootRef.current = { stage: "asset", started: Date.now(), settled: false };
    setBootStage("asset");
    setBootError(null);
    setLogs([]);
    setAssetInfo(null);
    setPhase("booting");
    ready.current = false;
    const watch = setInterval(() => {
      if (bootRef.current.settled) return;
      if (stageExpired(bootRef.current.started, Date.now())) failBoot(`timeout:${bootRef.current.stage}`);
    }, 1000);
    const ping = setInterval(() => {
      if (bootRef.current.settled) return;
      webRef.current?.injectJavaScript("window.__imelloHostPing&&window.__imelloHostPing();true;");
    }, 2000);
    return () => {
      clearInterval(watch);
      clearInterval(ping);
    };
  }, [failBoot, generation]);

  useEffect(() => {
    const total = rooms.reduce((sum, room) => sum + room.unread, 0);
    void Notifications.setBadgeCountAsync(total).catch(() => undefined);
  }, [rooms]);

  const call = useCallback(
    async <T,>(method: string, params?: unknown): Promise<T> => {
      try {
        return await rpc.call<T>(method, params);
      } catch (err) {
        if (err instanceof RpcError && err.code === "timeout") setNotice("timeout");
        throw err;
      }
    },
    [rpc],
  );

  const value = useMemo<SessionApi>(() => ({
    phase,
    me,
    rooms,
    messagesFor: (roomId) => timelines[roomId] ?? [],
    typingFor: (roomId) => rooms.find((r) => r.roomId === roomId)?.typing ?? [],
    shakeToken: shake.token,
    shakeRoom: shake.room,
    notice,
    api,
    refreshMe,
    async signIn(username, password, temporary) {
      const { homeserverUrl } = await api.config();
      const user = normalizePin(username) ?? username.trim().toLowerCase();
      await call("signIn", { homeserverUrl, username: user, password, temporary });
    },
    async register(input, temporary) {
      const username = input.username.trim().toLowerCase();
      await api.register({ ...input, username, locale: prefs.locale });
      const { homeserverUrl } = await api.config();
      await call("signIn", { homeserverUrl, username, password: input.password, temporary });
    },
    async quickStart(displayName) {
      const secret = b64url(await Crypto.getRandomBytesAsync(32));
      const { pin, homeserverUrl } = await api.quickStart({ deviceSecret: secret, displayName: displayName.trim() || undefined, locale: prefs.locale });
      await call("signIn", { homeserverUrl, username: pin, password: secret, temporary: false, deviceSecret: true });
    },
    async signOut() {
      await call("signOut");
    },
    async sendText(roomId, body) {
      await call("sendText", { roomId, body });
      if (prefs.sounds) playSound("sent");
    },
    sendPing: (roomId) => call("sendPing", { roomId }),
    retry: async (roomId, id) => {
      await call("retry", { roomId, id });
    },
    sendFile: async (roomId, file) => {
      await call("sendAttachment", { roomId, ...file });
      if (prefs.sounds) playSound("sent");
    },
    downloadFile: (roomId, eventId) => call("downloadAttachment", { roomId, eventId }),
    markRead: async (roomId) => {
      await call("markRead", { roomId });
    },
    setTyping: async (roomId, typing) => {
      await call("setTyping", { roomId, typing });
    },
    watch(roomId) {
      active.current = roomId;
      void call("watch", { roomId }).catch(() => undefined);
    },
    openDirect: async (userId) => (await call<{ roomId: string }>("openDirect", { userId })).roomId,
    acceptInvite: async (roomId) => {
      await call("acceptInvite", { roomId });
    },
    exportKeys: (passphrase) => call<{ file: string }>("exportKeys", { passphrase }).then((r) => r.file),
    importKeys: (file, passphrase) => call<{ n: number }>("importKeys", { file, passphrase }).then((r) => r.n),
    devices: () => call<{ devices: DeviceRow[] }>("listDevices").then((r) => r.devices),
    revokeDevice: async (deviceId, password) => {
      await call("revokeDevice", { deviceId, password });
    },
    protect: async (password) => {
      await call("protect", { password });
      await api.markProtected().then(setMe);
    },
    bootStage,
    bootError,
    logs,
    diagnostics: formatDiagnostics({
      stage: bootStage,
      message: bootError ?? "",
      logs,
      assetUri: assetInfo?.uri,
      assetBytes: assetInfo?.bytes,
    }),
    retryBoot: () => setGeneration((n) => n + 1),
  }), [phase, me, rooms, timelines, shake, notice, api, refreshMe, call, prefs.locale, prefs.sounds, bootStage, bootError, logs, assetInfo]);

  return (
    <Ctx.Provider value={value}>
      <EngineView key={generation} webRef={webRef} onMessage={onEngineMessage} onAsset={onAsset} onLoaded={onLoaded} />
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
