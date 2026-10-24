import { createAvatar } from "@dicebear/core";
import { lorelei, notionists, openPeeps, pixelArt, thumbs } from "@dicebear/collection";

const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "fde68a", "bbf7d0", "fecaca"];
const STYLES = [notionists, lorelei, openPeeps, thumbs, pixelArt];

const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Generates avatar suggestions locally with DiceBear, using only CC0-licensed styles, as SVG markup. */
export function suggestAvatars(count = 12): string[] {
  return Array.from({ length: count }, (_, i) =>
    createAvatar(STYLES[i % STYLES.length] as Parameters<typeof createAvatar>[0], {
      seed: randomSeed(),
      size: 192,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
    }).toString(),
  );
}
