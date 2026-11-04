import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

export type SoundName = "incoming" | "tick" | "sent" | "ping" | "group";

const sources: Record<SoundName, number> = {
  incoming: require("../../assets/sounds/incoming.wav"),
  tick: require("../../assets/sounds/tick.wav"),
  sent: require("../../assets/sounds/sent.wav"),
  ping: require("../../assets/sounds/ping.wav"),
  group: require("../../assets/sounds/group.wav"),
};

const players = new Map<SoundName, AudioPlayer>();
let armed = false;

/** Silent switch and Do Not Disturb win: these cues do not override them. */
export async function armSounds(): Promise<void> {
  if (armed) return;
  await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers", allowsRecording: false });
  armed = true;
}

export function playSound(name: SoundName): void {
  if (!armed) return;
  let player = players.get(name);
  if (!player) {
    player = createAudioPlayer(sources[name]);
    players.set(name, player);
  }
  void player.seekTo(0).then(() => player.play());
}
