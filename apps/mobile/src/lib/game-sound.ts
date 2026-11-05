import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer } from "expo-audio";
import { useEffect } from "react";
import { create } from "zustand";
import { playSound } from "./notify";

const KEY = "six:game-sound";
const MUSIC = require("../../assets/sounds/game-music.mp3");

interface GameSound {
  effects: boolean;
  music: boolean;
}

/** Whether live games play their sound effects (on unless turned off) and background music (off unless turned on). */
export const useGameSound = create<GameSound>(() => ({ effects: true, music: false }));

void AsyncStorage.getItem(KEY)
  .then((saved) => saved && useGameSound.setState(JSON.parse(saved)))
  .catch(() => null);

export function setGameSound(patch: Partial<GameSound>) {
  useGameSound.setState(patch);
  void AsyncStorage.setItem(KEY, JSON.stringify(useGameSound.getState())).catch(() => null);
}

export function playGameSound(asset: number) {
  if (useGameSound.getState().effects) playSound(asset);
}

/** Loops the game music while `on` and the music is turned on. */
export function useGameMusic(on: boolean) {
  const music = useGameSound((s) => s.music);
  useEffect(() => {
    if (!on || !music) return;
    const player = createAudioPlayer(MUSIC);
    player.loop = true;
    player.play();
    return () => player.remove();
  }, [on, music]);
}
