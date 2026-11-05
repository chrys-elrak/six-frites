import { useEffect } from "react";
import { create } from "zustand";
import { playSound } from "./notify";

const KEY = "six:game-sound";

interface GameSound {
  effects: boolean;
  music: boolean;
}

function saved(): Partial<GameSound> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Whether live games play their sound effects (on unless turned off) and background music (off unless turned on). */
export const useGameSound = create<GameSound>(() => ({ effects: true, music: false, ...saved() }));

export function setGameSound(patch: Partial<GameSound>) {
  useGameSound.setState(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(useGameSound.getState()));
  } catch {}
}

export function playGameSound(url: string) {
  if (useGameSound.getState().effects) playSound(url);
}

/** Loops the game music while `on` and the music is turned on. */
export function useGameMusic(on: boolean) {
  const music = useGameSound((s) => s.music);
  useEffect(() => (on && music ? playSound("/sounds/game-music.mp3", true) : undefined), [on, music]);
}
