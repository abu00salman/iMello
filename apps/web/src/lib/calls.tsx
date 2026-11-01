import {
  CallErrorCode,
  CallEvent,
  CallState,
  callsSupported,
  onIncomingCall,
  startVoiceCall,
  type MatrixCall,
} from "@imello/core/messaging";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../ui/components";
import { inApp, notificationsEnabled } from "./notifications";
import { usePrefs } from "./prefs";
import { useSession } from "./session";

interface CallsState {
  supported: boolean;
  active: MatrixCall | null;
  call: (roomId: string) => Promise<void>;
}

const Ctx = createContext<CallsState>({ supported: false, active: null, call: async () => undefined });
export const useCalls = () => useContext(Ctx);

/** Gentle two-tone ring generated with Web Audio (no audio files to load). */
function useRingtone() {
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<number>(0);
  const stop = useCallback(() => {
    clearInterval(timer.current);
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
  }, []);
  const start = useCallback(() => {
    stop();
    try {
      const ac = new AudioContext();
      ctx.current = ac;
      const beep = () => {
        for (const [freq, at] of [[880, 0], [660, 0.25]] as const) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, ac.currentTime + at);
          g.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + at + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + 0.22);
          o.connect(g).connect(ac.destination);
          o.start(ac.currentTime + at);
          o.stop(ac.currentTime + at + 0.25);
        }
      };
      beep();
      timer.current = window.setInterval(beep, 2000);
    } catch {
      /* audio not allowed until user interaction; the visual ring is enough */
    }
  }, [stop]);
  return { start, stop };
}

export function CallsProvider({ children }: { children: ReactNode }) {
  const { client } = useSession();
  const { t } = usePrefs();
  const [active, setActive] = useState<MatrixCall | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const ring = useRingtone();
  const supported = !!client && callsSupported(client);

  const attach = useCallback(
    (call: MatrixCall) => {
      setActive(call);
      setState(call.state as CallState);
      setMuted(false);
      setError(null);
      const onState = (s: CallState) => {
        setState(s);
        if (s === CallState.Connected) ring.stop();
      };
      const onFeeds = () => {
        if (audio.current) audio.current.srcObject = call.remoteUsermediaStream ?? null;
      };
      const onEnd = () => {
        ring.stop();
        setState(CallState.Ended);
        setTimeout(() => setActive((cur) => (cur === call ? null : cur)), 1500);
      };
      const onError = () => {
        setError(t("call.failed"));
        onEnd();
      };
      call.on(CallEvent.State, onState);
      call.on(CallEvent.FeedsChanged, onFeeds);
      call.on(CallEvent.Hangup, onEnd);
      call.on(CallEvent.Error, onError);
      onFeeds();
    },
    [ring, t],
  );

  // Incoming calls
  useEffect(() => {
    if (!client || !supported) return;
    return onIncomingCall(client, (call) => {
      if (active && active.state !== CallState.Ended) {
        call.reject();
        return;
      }
      attach(call);
      ring.start();
      if (document.visibilityState !== "visible" && notificationsEnabled()) {
        const name = call.getOpponentMember()?.name ?? "";
        const title = t("call.incoming", { name });
        if (inApp()) window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "notify", title, body: "📞", roomId: call.roomId }));
        else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { tag: call.callId });
      }
    });
  }, [client, supported, active, attach, ring, t]);

  // Call timer
  useEffect(() => {
    if (state !== CallState.Connected) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(id);
  }, [state]);

  const call = useCallback(
    async (roomId: string) => {
      if (!client) return;
      setError(null);
      try {
        const c = await startVoiceCall(client, roomId);
        attach(c);
      } catch {
        setError(t("call.micNeeded"));
      }
    },
    [client, attach, t],
  );

  const incoming = active && state === CallState.Ringing;
  const name = active?.getOpponentMember()?.name ?? "";
  const label =
    error ??
    (state === CallState.Ringing ? t("call.incomingShort")
      : state === CallState.InviteSent || state === CallState.WaitLocalMedia || state === CallState.CreateOffer ? t("call.ringing")
      : state === CallState.Connecting || state === CallState.CreateAnswer ? t("call.connecting")
      : state === CallState.Connected ? `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`
      : state === CallState.Ended ? t("call.ended")
      : "");

  return (
    <Ctx.Provider value={{ supported, active, call }}>
      {children}
      <audio ref={audio} autoPlay playsInline />
      {active && (
        <div className="call-overlay" role="dialog" aria-label={t("call.title")} data-testid="call-overlay">
          <div className="call-card">
            <Avatar name={name || "?"} id={active.getOpponentMember()?.userId ?? active.roomId} size={104} />
            <h2>{name}</h2>
            <p className="call-status" data-testid="call-status">{label}</p>
            <p className="lock-badge">🔒 {t("call.encrypted")}</p>
            <div className="call-actions">
              {incoming ? (
                <>
                  <button className="call-btn decline" onClick={() => { ring.stop(); active.reject(); }} aria-label={t("call.decline")}>✕</button>
                  <button className="call-btn accept" onClick={() => { ring.stop(); void active.answer(true, false); }} aria-label={t("call.accept")}>📞</button>
                </>
              ) : state !== CallState.Ended ? (
                <>
                  <button
                    className={`call-btn mute ${muted ? "on" : ""}`}
                    onClick={() => void active.setMicrophoneMuted(!muted).then(() => setMuted(!muted))}
                    aria-label={muted ? t("call.unmute") : t("call.mute")}
                    aria-pressed={muted}
                  >
                    {muted ? "🔇" : "🎙️"}
                  </button>
                  <button className="call-btn decline" onClick={() => active.hangup(CallErrorCode.UserHangup, false)} aria-label={t("call.hangup")}>✕</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
