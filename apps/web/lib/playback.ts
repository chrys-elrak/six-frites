import { create } from "zustand";
import { type VoiceEffect, playThroughEffect } from "./voice-fx";

export const RATES = [1, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

const KEY = "six:playback-rate";

function load(): Rate {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return (RATES as readonly number[]).includes(saved) ? (saved as Rate) : 1;
  } catch {
    return 1;
  }
}

interface PlaybackState {
  rate: Rate;
  next: () => void;
}

/** Playback speed for voice and video messages, remembered on this device. */
export const usePlaybackRate = create<PlaybackState>((set, get) => ({
  rate: typeof window === "undefined" ? 1 : load(),
  next() {
    const rate = RATES[(RATES.indexOf(get().rate) + 1) % RATES.length]!;
    try {
      localStorage.setItem(KEY, String(rate));
    } catch {}
    set({ rate });
  },
}));

export interface VoiceTrack {
  url: string;
  chatId: string | null;
  title: string;
  name?: string;
  effect: VoiceEffect;
  onStop?: (finished: boolean) => void;
}

/** The one voice message playing, shared by its bubble and the mini player, so it keeps going after you leave the chat. */
export const useVoice = create<{ track: VoiceTrack | null; playing: boolean; position: number; duration: number }>(
  () => ({ track: null, playing: false, position: 0, duration: 0 }),
);

let el: HTMLAudioElement | null = null;
let fx: ReturnType<typeof playThroughEffect> | null = null;
let media: HTMLMediaElement | null = null;

/** Pauses whatever voice note or video message was playing, so only `next` makes sound. */
export function claimMedia(next: HTMLMediaElement) {
  if (media && media !== next) media.pause();
  media = next;
}

function audio() {
  if (el) return el;
  const a = new Audio();
  a.playbackRate = usePlaybackRate.getState().rate;
  a.ontimeupdate = () => useVoice.setState({ position: a.currentTime * 1000 });
  a.ondurationchange = () => Number.isFinite(a.duration) && useVoice.setState({ duration: a.duration * 1000 });
  a.onplay = () => useVoice.setState({ playing: true });
  a.onpause = () => {
    useVoice.setState({ playing: false });
    useVoice.getState().track?.onStop?.(false);
  };
  a.onended = () => {
    const { track } = useVoice.getState();
    useVoice.setState({ track: null, playing: false, position: 0 });
    track?.onStop?.(true);
  };
  usePlaybackRate.subscribe(({ rate }) => (a.playbackRate = rate));
  el = a;
  return a;
}

async function route(effect: VoiceEffect) {
  if (!el || (effect === "none" && !fx)) return;
  fx ??= playThroughEffect(el);
  (await fx).apply(effect);
}

export async function playVoice(track: VoiceTrack) {
  const a = audio();
  if (useVoice.getState().track?.url !== track.url) {
    a.pause();
    a.src = track.url;
    useVoice.setState({ position: 0, duration: 0 });
  }
  useVoice.setState({ track });
  claimMedia(a);
  await route(track.effect).catch(() => null);
  await a.play().catch(() => null);
}

export const pauseVoice = () => el?.pause();

export function seekVoice(ms: number) {
  if (!el) return;
  el.currentTime = ms / 1000;
  useVoice.setState({ position: ms });
}

export function setVoiceEffect(effect: VoiceEffect) {
  const { track } = useVoice.getState();
  if (!track) return;
  useVoice.setState({ track: { ...track, effect } });
  void route(effect).catch(() => null);
}

export function stopVoice() {
  el?.pause();
  useVoice.setState({ track: null, playing: false, position: 0 });
}
