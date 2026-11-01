import {
  CallErrorCode,
  CallEvent,
  CallState,
  callsSupported,
  isVideoCall,
  onIncomingCall,
  otherMemberId,
  startVideoCall,
  startVoiceCall,
  switchCamera,
  type MatrixCall,
} from "@imello/core/messaging";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "../ui/components";
import { prettyName } from "./names";
import { inApp, notificationsEnabled } from "./notifications";
import { usePrefs } from "./prefs";
import { useSession } from "./session";

interface CallsState {
  supported: boolean;
  active: MatrixCall | null;
  call: (roomId: string, video?: boolean) => Promise<void>;
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

const Icon = {
  phone: <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .6 3.6 1 1 0 0 1-.25 1Z" /></svg>,
  end: <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.4-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.4.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9Z" /></svg>,
  mic: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>,
  micOff: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 11h-1.7a5.3 5.3 0 0 1-.7 2.6l1.2 1.2A6.9 6.9 0 0 0 19 11ZM15 11.2V5a3 3 0 0 0-5.9-.8L15 10.1v1.1ZM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.5 2.6l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1a6.9 6.9 0 0 0 3.5-1.4l3.2 3.2 1.3-1.3L4.3 3Z" /></svg>,
  cam: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" /></svg>,
  camOff: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.8L21 17.2V6.5ZM3.3 2 2 3.3 4.7 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.2 0 .4-.1.6-.2l3.1 3.2 1.3-1.3L3.3 2Z" /></svg>,
  flip: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5Z" /></svg>,
  video: <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" /></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2ZM9 7a3 3 0 0 1 6 0v2H9V7Z" /></svg>,
};

export function CallsProvider({ children }: { children: ReactNode }) {
  const { client, api } = useSession();
  const { t } = usePrefs();
  const [active, setActive] = useState<MatrixCall | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const ring = useRingtone();
  const supported = !!client && callsSupported(client);
  const video = !!active && isVideoCall(active);

  const attach = useCallback(
    (call: MatrixCall) => {
      setActive(call);
      setState(call.state as CallState);
      setMuted(false);
      setCamOff(false);
      setHasRemoteVideo(false);
      setError(null);
      const onState = (s: CallState) => {
        setState(s);
        if (s === CallState.Connected) ring.stop();
      };
      const onFeeds = () => {
        const remote = call.remoteUsermediaStream ?? null;
        if (audio.current) audio.current.srcObject = isVideoCall(call) ? null : remote;
        if (remoteVideo.current && remoteVideo.current.srcObject !== remote) remoteVideo.current.srcObject = remote;
        if (localVideo.current) localVideo.current.srcObject = call.localUsermediaStream ?? null;
        setHasRemoteVideo(!!remote?.getVideoTracks().some((tr) => tr.readyState === "live"));
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
      // Video elements mount with the overlay; wire feeds after render.
      requestAnimationFrame(onFeeds);
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
        if (inApp()) window.ReactNativeWebView!.postMessage(JSON.stringify({ type: "notify", title, body: isVideoCall(call) ? "🎥" : "📞", roomId: call.roomId }));
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
    async (roomId: string, withVideo = false) => {
      if (!client) return;
      setError(null);
      try {
        const c = await (withVideo ? startVideoCall(client, roomId) : startVoiceCall(client, roomId));
        attach(c);
        // Ring the other person's devices even if iMello is closed there (content-free push).
        const other = otherMemberId(client, roomId);
        if (other) void api.ring(other, roomId, withVideo).catch(() => undefined);
      } catch {
        setError(withVideo ? t("call.cameraNeeded") : t("call.micNeeded"));
      }
    },
    [client, api, attach, t],
  );

  const incoming = active && state === CallState.Ringing;
  const connected = state === CallState.Connected;
  const name = prettyName(active?.getOpponentMember()?.name ?? (active ? client?.getRoom(active.roomId)?.name : "") ?? "");
  const label =
    error ??
    (state === CallState.Ringing ? (video ? t("call.incomingVideo") : t("call.incomingShort"))
      : state === CallState.InviteSent || state === CallState.WaitLocalMedia || state === CallState.CreateOffer ? t("call.ringing")
      : state === CallState.Connecting || state === CallState.CreateAnswer ? t("call.connecting")
      : connected ? `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`
      : state === CallState.Ended ? t("call.ended")
      : "");

  const hangup = () => active?.hangup(CallErrorCode.UserHangup, false);
  const toggleMute = () => active && void active.setMicrophoneMuted(!muted).then(() => setMuted(!muted));
  const toggleCam = () => active && void active.setLocalVideoMuted(!camOff).then(() => setCamOff(!camOff));
  const flip = () => client && active && void switchCamera(client, active).catch(() => undefined);
  // Show the remote picture full-screen once it arrives; before that, your own camera fills the
  // screen (like FaceTime) so you can check how you look while it rings.
  const remoteShown = video && connected && hasRemoteVideo;

  return (
    <Ctx.Provider value={{ supported, active, call }}>
      {children}
      <audio ref={audio} autoPlay playsInline />
      {active && (
        <div className={`call-overlay ${video ? "video" : ""} ${remoteShown ? "remote-on" : ""}`} role="dialog" aria-label={video ? t("call.video") : t("call.title")} data-testid="call-overlay">
          <div className="call-aurora" aria-hidden="true" />
          {video && (
            <>
              <video ref={remoteVideo} className="remote-video" autoPlay playsInline data-testid="remote-video" />
              <video ref={localVideo} className={`local-video ${camOff ? "off" : ""}`} autoPlay playsInline muted data-testid="local-video" />
              <div className="video-scrim" aria-hidden="true" />
            </>
          )}
          <div className="call-card">
            {!remoteShown && (
              <div className="call-ring">
                <Avatar name={name || "?"} id={active.getOpponentMember()?.userId ?? active.roomId} size={video ? 96 : 120} />
              </div>
            )}
            <h2>{name}</h2>
            <p className="call-status" data-testid="call-status">{label}</p>
            <p className="lock-badge">{Icon.lock} {t("call.encrypted")}</p>
            <div className={`call-actions ${video && !incoming ? "glass-bar" : ""}`}>
              {incoming ? (
                <>
                  <button className="call-btn decline" onClick={() => { ring.stop(); active.reject(); }} aria-label={t("call.decline")}>{Icon.end}</button>
                  <button className="call-btn accept" onClick={() => { ring.stop(); void active.answer(true, video); }} aria-label={video ? t("call.acceptVideo") : t("call.accept")}>
                    {video ? Icon.video : Icon.phone}
                  </button>
                </>
              ) : state !== CallState.Ended ? (
                <>
                  <button className={`call-btn mute ${muted ? "on" : ""}`} onClick={toggleMute} aria-label={muted ? t("call.unmute") : t("call.mute")} aria-pressed={muted}>
                    {muted ? Icon.micOff : Icon.mic}
                  </button>
                  {video && (
                    <>
                      <button className={`call-btn mute ${camOff ? "on" : ""}`} onClick={toggleCam} aria-label={camOff ? t("call.cameraOn") : t("call.cameraOff")} aria-pressed={camOff}>
                        {camOff ? Icon.camOff : Icon.cam}
                      </button>
                      <button className="call-btn mute" onClick={flip} aria-label={t("call.flip")}>{Icon.flip}</button>
                    </>
                  )}
                  <button className="call-btn decline" onClick={hangup} aria-label={t("call.hangup")}>{Icon.end}</button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
