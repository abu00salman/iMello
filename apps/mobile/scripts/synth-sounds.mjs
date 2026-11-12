/**
 * Original Wanas cues, synthesised here (no samples).
 * Falling major second for messages. Ping is three wooden taps, not a two-note rise.
 * See the sound brief: E5 centre, no rising minor third, no third-party alerts.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48_000;

function writeWav(file, samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] * gain));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(file, buf);
}

function silence(seconds) {
  return new Float64Array(Math.floor(seconds * SR));
}

function addPluck(out, freq, start, dur, amp, damp) {
  const from = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-damp * t);
    const body =
      Math.sin(2 * Math.PI * freq * t) * 0.78 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.14 +
      Math.sin(2 * Math.PI * freq * 3.02 * t) * 0.05;
    const idx = from + i;
    if (idx < out.length) out[idx] += body * env * amp;
  }
}

function addNoise(out, start, dur, amp) {
  const from = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let low = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    low += 0.12 * (white - low);
    const t = i / SR;
    const env = Math.exp(-14 * t) * Math.min(1, t / 0.003);
    const idx = from + i;
    if (idx < out.length) out[idx] += low * env * amp;
  }
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/sounds");
mkdirSync(dir, { recursive: true });

const incoming = silence(0.58);
addPluck(incoming, 659.25, 0.02, 0.34, 0.7, 7);
addPluck(incoming, 587.33, 0.2, 0.34, 0.5, 7);
writeWav(path.join(dir, "incoming.wav"), incoming);

const tick = silence(0.09);
addPluck(tick, 987.77, 0.01, 0.07, 0.45, 28);
writeWav(path.join(dir, "tick.wav"), tick);

const sent = silence(0.16);
addNoise(sent, 0.01, 0.12, 0.35);
addPluck(sent, 1318.5, 0.012, 0.05, 0.18, 40);
writeWav(path.join(dir, "sent.wav"), sent);

const ping = silence(0.86);
addPluck(ping, 110, 0.02, 0.12, 0.45, 16);
addPluck(ping, 659.25, 0.02, 0.16, 0.7, 10);
addPluck(ping, 659.25, 0.16, 0.16, 0.62, 10);
addPluck(ping, 830.61, 0.34, 0.42, 0.75, 6);
writeWav(path.join(dir, "ping.wav"), ping);

// Same five choices as the web client (apps/web/src/lib/sounds.ts).
const taps = silence(0.86);
addPluck(taps, 164.81, 0.02, 0.18, 0.45, 12);
addPluck(taps, 659.25, 0.02, 0.16, 0.7, 10);
addPluck(taps, 659.25, 0.14, 0.16, 0.62, 10);
addPluck(taps, 830.61, 0.3, 0.42, 0.75, 6);
writeWav(path.join(dir, "ping_taps.wav"), taps);

const knock = silence(0.5);
for (const start of [0.02, 0.17]) {
  addPluck(knock, 130.81, start, 0.14, 0.7, 16);
  addNoise(knock, start, 0.06, 0.4);
}
writeWav(path.join(dir, "ping_knock.wav"), knock);

const bell = silence(1.05);
addPluck(bell, 1046.5, 0.02, 0.9, 0.55, 4);
addPluck(bell, 1567.98, 0.02, 0.7, 0.28, 4);
addPluck(bell, 2093, 0.04, 0.5, 0.16, 5);
writeWav(path.join(dir, "ping_bell.wav"), bell);

const chirp = silence(0.45);
[1318.51, 1567.98, 1975.53].forEach((freq, i) => addPluck(chirp, freq, 0.02 + i * 0.07, 0.12, 0.55, 18));
writeWav(path.join(dir, "ping_chirp.wav"), chirp);

const drum = silence(0.7);
[0, 0.09, 0.18, 0.3].forEach((start, i) => addPluck(drum, i === 3 ? 98 : 110, 0.02 + start, 0.22, 0.8, 10));
writeWav(path.join(dir, "ping_drum.wav"), drum);

const group = silence(0.62);
addPluck(group, 493.88, 0.02, 0.32, 0.65, 7);
addPluck(group, 440, 0.2, 0.36, 0.48, 7);
addPluck(group, 659.25, 0.2, 0.3, 0.18, 8);
writeWav(path.join(dir, "group.wav"), group);
