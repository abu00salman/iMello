import {
  downloadAttachment,
  isDangerousFile,
  type AttachmentInfo,
  type MatrixClient,
} from "@imello/core/messaging";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../lib/prefs";

/** Decrypted blobs cached for this tab only (never written to disk). */
const blobCache = new Map<string, string>();

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null): string {
  if (!ms) return "0:00";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Photos and voice messages decrypt automatically (small, safe types). Files decrypt only on request. */
const AUTO_LOAD_LIMIT = 15 * 1024 * 1024;

function useDecrypted(client: MatrixClient, info: AttachmentInfo, auto: boolean) {
  const key = info.file.url;
  const [url, setUrl] = useState<string | null>(() => blobCache.get(key) ?? null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const load = async () => {
    if (blobCache.has(key)) return setUrl(blobCache.get(key)!);
    setState("loading");
    try {
      const blob = await downloadAttachment(client, info);
      const u = URL.createObjectURL(blob);
      blobCache.set(key, u);
      setUrl(u);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    if (auto && !url && info.size <= AUTO_LOAD_LIMIT) void load();
  }, [key]);
  return { url, state, load };
}

export function AttachmentView({ client, info }: { client: MatrixClient; info: AttachmentInfo }) {
  const { t } = usePrefs();
  const auto = info.kind === "image" || info.kind === "audio";
  const { url, state, load } = useDecrypted(client, info, auto);

  if (info.kind === "image") {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="att-image-link">
        <img
          src={url}
          alt={t("chat.photo")}
          className="att-image"
          width={info.width ?? undefined}
          height={info.height ?? undefined}
          data-testid="attachment-image"
        />
      </a>
    ) : (
      <div className="att-placeholder" aria-busy={state === "loading"}>
        {state === "error" ? <button className="link" onClick={() => void load()}>{t("chat.retry")}</button> : "🖼️ …"}
      </div>
    );
  }

  if (info.kind === "audio") {
    return (
      <div className="att-voice" data-testid="attachment-voice">
        <span aria-hidden="true">🎤</span>
        {url ? <VoicePlayer src={url} durationMs={info.durationMs} /> : <span className="muted">{formatDuration(info.durationMs)} …</span>}
      </div>
    );
  }

  if (info.kind === "video" && url) {
    return <video src={url} controls className="att-video" />;
  }

  const dangerous = isDangerousFile(info.name, info.mimetype);
  async function save() {
    if (dangerous && !confirm(t("chat.dangerousFile"))) return;
    let u = url;
    if (!u) {
      await load();
      u = blobCache.get(info.file.url) ?? null;
    }
    if (!u) return;
    const a = document.createElement("a");
    a.href = u;
    a.download = info.name;
    a.click();
  }
  return (
    <div className="att-file" data-testid="attachment-file">
      <span className="att-file-icon" aria-hidden="true">{dangerous ? "⚠️" : "📄"}</span>
      <span className="att-file-main">
        <span className="att-file-name" dir="auto">{info.name}</span>
        <small className="muted">{formatBytes(info.size)}</small>
      </span>
      <button className="btn btn-secondary att-download" onClick={() => void save()} aria-busy={state === "loading" || undefined}>
        {state === "loading" ? "…" : t("chat.download")}
      </button>
    </div>
  );
}

const SPEEDS = [1, 1.5, 2];

function VoicePlayer({ src, durationMs }: { src: string; durationMs: number | null }) {
  const { t } = usePrefs();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  return (
    <span className="voice-player">
      <button
        className="voice-play"
        onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
        aria-label={playing ? t("chat.pause") : t("chat.play")}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="voice-track" aria-hidden="true">
        <span className="voice-fill" ref={(el) => el?.style.setProperty("--p", `${progress * 100}%`)} />
      </span>
      <small className="voice-time">{formatDuration(durationMs)}</small>
      <button
        className="voice-speed"
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
          setSpeed(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
        aria-label={t("chat.speed")}
      >
        {speed}×
      </button>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (durationMs ?? 0) / 1000;
          setProgress(total ? Math.min(1, el.currentTime / total) : 0);
        }}
      />
    </span>
  );
}

/** Pick a recording format the browser supports (Safari records MP4/AAC, Chrome/Firefox WebM/Opus). */
function recorderMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export interface Recording {
  blob: Blob;
  mimetype: string;
  durationMs: number;
}

/** Tap to record, tap to send, or cancel. The audio stays in memory until it is encrypted and sent. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number>(0);
  const resolveStop = useRef<((r: Recording | null) => void) | null>(null);
  const cancelled = useRef(false);

  async function start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = recorderMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    chunks.current = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      clearInterval(timer.current);
      setRecording(false);
      const durationMs = Date.now() - started.current;
      const type = rec.mimeType || mime || "audio/webm";
      resolveStop.current?.(cancelled.current ? null : { blob: new Blob(chunks.current, { type }), mimetype: type.split(";")[0]!, durationMs });
      resolveStop.current = null;
    };
    recorder.current = rec;
    started.current = Date.now();
    setElapsed(0);
    timer.current = window.setInterval(() => setElapsed(Date.now() - started.current), 250);
    rec.start(250);
    setRecording(true);
  }

  function stop(): Promise<Recording | null> {
    return new Promise((resolve) => {
      resolveStop.current = resolve;
      recorder.current?.stop();
    });
  }

  function cancel() {
    cancelled.current = true;
    recorder.current?.stop();
  }

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return { recording, elapsed, start, stop, cancel };
}

/** Read an image's pixel size (sent with the encrypted event so the bubble can reserve space). */
export async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}
