/**
 * Original in-app sounds, synthesised in the browser (no samples).
 * Tonal centre E5, falling major second for a new message. Not a rising chime.
 * D and R are silent.
 */

const MESSAGE_KEY = "imello.sound.message";
const IN_CHAT_KEY = "imello.sound.inchat";
const PING_KEY = "imello.sound.ping";

function enabled(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "false";
  } catch {
    return true;
  }
}

export function soundEnabled(kind: "message" | "inChat" | "ping"): boolean {
  return enabled(kind === "message" ? MESSAGE_KEY : kind === "inChat" ? IN_CHAT_KEY : PING_KEY);
}

export function setSoundEnabled(kind: "message" | "inChat" | "ping", on: boolean) {
  const key = kind === "message" ? MESSAGE_KEY : kind === "inChat" ? IN_CHAT_KEY : PING_KEY;
  try { localStorage.setItem(key, String(on)); } catch { /* ignore */ }
}

let ctx: AudioContext | null = null;
let unlocked = false;

function audio(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from the first pointer/key gesture so later sounds are allowed to play. */
export function unlockSounds() {
  if (unlocked) return;
  unlocked = true;
  audio();
}

function envGain(c: AudioContext, when: number, peak: number, attack: number, dur: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  return g;
}

/** Soft glass pluck: sine plus a quiet octave-down body, low-passed. No square or saw. */
function pluck(c: AudioContext, when: number, freq: number, dur: number, peak: number) {
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2800, when);
  filter.frequency.exponentialRampToValueAtTime(900, when + dur);
  const g = envGain(c, when, peak, 0.004, dur);
  const tone = c.createOscillator();
  tone.type = "sine";
  tone.frequency.value = freq;
  const body = c.createOscillator();
  body.type = "sine";
  body.frequency.value = freq / 2;
  const bodyGain = c.createGain();
  bodyGain.gain.value = 0.22;
  tone.connect(filter);
  body.connect(bodyGain);
  bodyGain.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  tone.start(when);
  body.start(when);
  tone.stop(when + dur + 0.02);
  body.stop(when + dur + 0.02);
}

function noiseBurst(c: AudioContext, when: number, dur: number, peak: number) {
  const n = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  const g = envGain(c, when, peak, 0.002, dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + dur);
}

function play(run: (c: AudioContext, t: number) => void) {
  const c = audio();
  if (!c || !unlocked) return;
  run(c, c.currentTime + 0.01);
}

/** New message while this chat is not the one on screen. E5 → D5, falling second. */
export function playIncoming(group = false) {
  if (!soundEnabled("message")) return;
  const root = group ? 493.88 : 659.25; // B4 or E5
  const next = group ? 440 : 587.33; // A4 or D5
  play((c, t) => {
    pluck(c, t, root, 0.28, 0.09);
    pluck(c, t + 0.16, next, 0.34, 0.06);
  });
}

/** Barely-there tick for a message in the open chat. */
export function playTick() {
  if (!soundEnabled("inChat")) return;
  play((c, t) => pluck(c, t, 987.77, 0.07, 0.035));
}

/** Soft flick when your own message leaves. */
export function playSent() {
  if (!soundEnabled("inChat")) return;
  play((c, t) => {
    noiseBurst(c, t, 0.09, 0.03);
    pluck(c, t, 880, 0.08, 0.02);
  });
}

export const PING_SOUNDS = ["taps", "knock", "bell", "chirp", "drum"] as const;
export type PingSound = (typeof PING_SOUNDS)[number];
const PING_SOUND_KEY = "imello.sound.pingTone";

export function pingSound(): PingSound {
  try {
    const v = localStorage.getItem(PING_SOUND_KEY);
    return (PING_SOUNDS as readonly string[]).includes(v ?? "") ? (v as PingSound) : "taps";
  } catch {
    return "taps";
  }
}
export function setPingSound(v: PingSound) {
  try { localStorage.setItem(PING_SOUND_KEY, v); } catch { /* ignore */ }
}

const PING_TONES: Record<PingSound, (c: AudioContext, t: number) => void> = {
  // Three wooden taps, E5 E5 G#5, with a low thump under the first.
  taps: (c, t) => {
    pluck(c, t, 164.81, 0.18, 0.07);
    pluck(c, t, 659.25, 0.16, 0.11);
    pluck(c, t + 0.12, 659.25, 0.16, 0.1);
    pluck(c, t + 0.28, 830.61, 0.32, 0.12);
  },
  // Two knocks on a door.
  knock: (c, t) => {
    for (const d of [0, 0.15]) { pluck(c, t + d, 130.81, 0.12, 0.14); noiseBurst(c, t + d, 0.05, 0.05); }
  },
  // A small bell: fifth and octave ringing out.
  bell: (c, t) => {
    pluck(c, t, 1046.5, 0.9, 0.08);
    pluck(c, t, 1567.98, 0.7, 0.04);
    pluck(c, t + 0.02, 2093, 0.5, 0.025);
  },
  // A rising bird-like chirp.
  chirp: (c, t) => {
    [1318.51, 1567.98, 1975.53].forEach((f, i) => pluck(c, t + i * 0.07, f, 0.09, 0.06));
  },
  // Low drum roll.
  drum: (c, t) => {
    [0, 0.09, 0.18, 0.3].forEach((d, i) => pluck(c, t + d, i === 3 ? 98 : 110, 0.2, 0.12));
  },
};

/** The chosen Ping sound. */
export function playPing() {
  if (!soundEnabled("ping")) return;
  play(PING_TONES[pingSound()]);
}

/** Preview a Ping sound from Settings (a tap there unlocks audio). */
export function previewPing(v: PingSound) {
  unlocked = true;
  const c = audio();
  if (c) PING_TONES[v](c, c.currentTime + 0.01);
}
