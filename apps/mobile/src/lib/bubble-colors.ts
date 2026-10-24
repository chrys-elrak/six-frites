import { createContext, useContext } from "react";
import { brand, brandInk } from "./theme";

export interface BubbleColors {
  bg: string;
  ink: string;
  /** The other person's bubbles; null keeps the app's neutral surface. */
  theirBg: string | null;
  theirInk: string | null;
}

/** Colours of your own message bubbles in the chat on screen, set by its theme. */
export const BubbleColorsContext = createContext<BubbleColors>({ bg: brand, ink: brandInk, theirBg: null, theirInk: null });

export const useBubbleColors = () => useContext(BubbleColorsContext);

/** A #rrggbb colour at the given opacity, as #rrggbbaa. */
export const alpha = (hex: string, a: number) =>
  `${hex.slice(0, 7)}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;
