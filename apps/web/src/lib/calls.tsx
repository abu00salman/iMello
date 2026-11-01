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
import { prettyName } from "./names";

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
        const name = prettyName(call.getOpponentMember()?.name ?? client.getRoom(call.roomId)?.name ?? "");
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
  const name = prettyName(active?.getOpponentMember()?.name ?? (active ? client?.getRoom(active.roomId)?.name : "") ?? "");
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
          <div className="call-aurora" aria-hidden="true" />
          <div className="call-card">
            <div className="call-ring">
            <Avatar name={name || "?"} id={active.getOpponentMember()?.userId ?? active.roomId} size={120} />
            </div>
            <h2>{name}</h2>
            <p className="call-status" data-testid="call-status">{label}</p>
            <p className="lock-badge"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2ZM9 7a3 3 0 0 1 6 0v2H9V7Z" /></svg> {t("call.encrypted")}</p>
            <div className="call-actions">
              {incoming ? (
                <>
                  <button className="call-btn decline" onClick={() => { ring.stop(); active.reject(); }} aria-label={t("call.decline")}><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.4-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.4.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9Z" /></svg></button>
                  <button className="call-btn accept" onClick={() => { ring.stop(); void active.answer(true, false); }} aria-label={t("call.accept")}><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1Z" /></svg></button>
                </>
              ) : state !== CallState.Ended ? (
                <>
                  <button
                    className={`call-btn mute ${muted ? "on" : ""}`}
                    onClick={() => void active.setMicrophoneMuted(!muted).then(() => setMuted(!muted))}
                    aria-label={muted ? t("call.unmute") : t("call.mute")}
                    aria-pressed={muted}
                  >
                    {muted ? <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 11h-1.7a5.3 5.3 0 0 1-.7 2.6l1.2 1.2A6.9 6.9 0 0 0 19 11ZM15 11.2V5a3 3 0 0 0-5.9-.8L15 10.1v1.1ZM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.5 2.6l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a6.9 6.9 0 0 0 3.5-1.4l3.2 3.2 1.3-1.3L4.3 3Z" /></svg> : <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>}
                  </button>
                  <button className="call-btn decline" onClick={() => active.hangup(CallErrorCode.UserHangup, false)} aria-label={t("call.hangup")}><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.4-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.4.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9Z" /></svg></button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
