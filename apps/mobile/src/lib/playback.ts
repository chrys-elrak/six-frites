import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { create } from "zustand";

export const RATES = [1, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

const KEY = "six:playback-rate";

interface PlaybackState {
  rate: Rate;
  next: () => void;
}

/** Playback speed for voice and video messages, remembered on this device. */
export const usePlaybackRate = create<PlaybackState>((set, get) => ({
  rate: 1,
  next() {
    const rate = RATES[(RATES.indexOf(get().rate) + 1) % RATES.length]!;
    void AsyncStorage.setItem(KEY, String(rate)).catch(() => null);
    set({ rate });
  },
}));

void AsyncStorage.getItem(KEY)
  .then((saved) => {
    const rate = Number(saved);
    if ((RATES as readonly number[]).includes(rate)) usePlaybackRate.setState({ rate: rate as Rate });
  })
  .catch(() => null);

let stopCurrent: (() => void) | null = null;

/** Makes sure only one voice note or video message plays at a time. */
export function claimPlayback(stop: () => void) {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

let audioModeSet = false;
export function ensureAudioMode() {
  if (audioModeSet) return;
  audioModeSet = true;
  void setAudioModeAsync({ playsInSilentMode: true }).catch(() => null);
}

export interface VoiceTrack {
  url: string;
  chatId: string | null;
  title: string;
  onStop?: (finished: boolean) => void;
}

/** The one voice message playing, shared by its bubble and the mini player, so it keeps going after you leave the chat. */
export const useVoice = create<{ track: VoiceTrack | null; playing: boolean; position: number; duration: number }>(
  () => ({ track: null, playing: false, position: 0, duration: 0 }),
);

let player: AudioPlayer | null = null;

function voicePlayer() {
  if (player) return player;
  const p = createAudioPlayer(null);
  p.addListener("playbackStatusUpdate", (s) => {
    if (s.didJustFinish) {
      const { track } = useVoice.getState();
      p.pause();
      void p.seekTo(0);
      useVoice.setState({ track: null, playing: false, position: 0 });
      track?.onStop?.(true);
      return;
    }
    const { rate } = usePlaybackRate.getState();
    if (s.isLoaded && s.playbackRate !== rate) p.setPlaybackRate(rate);
    useVoice.setState({ playing: s.playing, position: s.currentTime * 1000, duration: s.duration * 1000 });
  });
  usePlaybackRate.subscribe(({ rate }) => p.setPlaybackRate(rate));
  player = p;
  return p;
}

export function pauseVoice() {
  if (!player?.playing) return;
  player.pause();
  useVoice.setState({ playing: false });
  useVoice.getState().track?.onStop?.(false);
}

export function playVoice(track: VoiceTrack) {
  ensureAudioMode();
  const p = voicePlayer();
  if (useVoice.getState().track?.url !== track.url) {
    pauseVoice();
    p.replace({ uri: track.url });
    useVoice.setState({ position: 0, duration: 0 });
  }
  useVoice.setState({ track, playing: true });
  claimPlayback(pauseVoice);
  p.play();
}

export function seekVoice(ms: number) {
  void player?.seekTo(ms / 1000);
  useVoice.setState({ position: ms });
}

export function stopVoice() {
  player?.pause();
  useVoice.setState({ track: null, playing: false, position: 0 });
}
