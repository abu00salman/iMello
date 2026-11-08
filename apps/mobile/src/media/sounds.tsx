import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { PING_SOUNDS, type PingSound } from "./ping-tones";

export { PING_SOUNDS, type PingSound };

export type SoundName = "incoming" | "tick" | "sent" | "ping" | "group";

const sources: Record<SoundName, number> = {
  incoming: require("../../assets/sounds/incoming.wav"),
  tick: require("../../assets/sounds/tick.wav"),
  sent: require("../../assets/sounds/sent.wav"),
  ping: require("../../assets/sounds/ping-taps.wav"),
  group: require("../../assets/sounds/group.wav"),
};

const pingSources: Record<PingSound, number> = {
  taps: require("../../assets/sounds/ping-taps.wav"),
  knock: require("../../assets/sounds/ping-knock.wav"),
  bell: require("../../assets/sounds/ping-bell.wav"),
  chirp: require("../../assets/sounds/ping-chirp.wav"),
  drum: require("../../assets/sounds/ping-drum.wav"),
};

const players = new Map<SoundName, AudioPlayer>();
const pingPlayers = new Map<PingSound, AudioPlayer>();
let armed = false;

/** Silent switch and Do Not Disturb win: these cues do not override them. */
export async function armSounds(): Promise<void> {
  if (armed) return;
  await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", allowsRecording: false });
  armed = true;
}

function start(player: AudioPlayer): void {
  void player.seekTo(0).then(() => player.play());
}

export function playSound(name: SoundName): void {
  if (!armed) return;
  let player = players.get(name);
  if (!player) {
    player = createAudioPlayer(sources[name]);
    players.set(name, player);
  }
  start(player);
}

/** The Ping sound chosen in Settings. Call only when sounds are on. */
export function playPing(tone: PingSound): void {
  if (!armed) return;
  let player = pingPlayers.get(tone);
  if (!player) {
    player = createAudioPlayer(pingSources[tone]);
    pingPlayers.set(tone, player);
  }
  start(player);
}

/** Settings preview. A tap there is enough to arm playback, even if sounds are off. */
export async function previewPing(tone: PingSound): Promise<void> {
  await armSounds();
  playPing(tone);
}
