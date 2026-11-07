import { GENDER_LOOKS, type Gender } from "@six/shared";
import { createAvatar } from "@dicebear/core";
import { lorelei, notionists, openPeeps, pixelArt, thumbs } from "@dicebear/collection";

const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "fde68a", "bbf7d0", "fecaca"];
const STYLES = [notionists, lorelei, openPeeps, thumbs, pixelArt];

const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Generates avatar suggestions locally with DiceBear, using only CC0-licensed styles, as SVG markup; with a gender, only heads of a girl or a boy. */
export function suggestAvatars(count = 12, gender?: Gender): string[] {
  const looks = gender && GENDER_LOOKS[gender];
  const styles = looks
    ? [
        [openPeeps, looks.openPeeps],
        [pixelArt, looks.pixelArt],
      ]
    : STYLES.map((s) => [s, {}]);
  return Array.from({ length: count }, (_, i) => {
    const [style, options] = styles[i % styles.length]!;
    return createAvatar(style as Parameters<typeof createAvatar>[0], {
      seed: randomSeed(),
      size: 192,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
      ...options,
    }).toString();
  });
}
