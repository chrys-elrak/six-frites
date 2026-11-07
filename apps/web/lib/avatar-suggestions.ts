import { GENDER_LOOKS, type Gender, aliasAvatar, randomAlias } from "@six/shared";

const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "fde68a", "bbf7d0", "fecaca"];

const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Generates avatar suggestions locally with DiceBear, using only CC0-licensed styles; with a gender, only heads of a girl or a boy. */
export async function suggestAvatars(count = 12, gender?: Gender): Promise<string[]> {
  const [{ createAvatar }, { notionists, lorelei, openPeeps, thumbs, pixelArt }] = await Promise.all([
    import("@dicebear/core"),
    import("@dicebear/collection"),
  ]);
  const looks = gender && GENDER_LOOKS[gender];
  const styles = looks
    ? [
        [openPeeps, looks.openPeeps],
        [pixelArt, looks.pixelArt],
      ]
    : [notionists, lorelei, openPeeps, thumbs, pixelArt].map((s) => [s, {}]);
  return Array.from({ length: count }, (_, i) => {
    const [style, options] = styles[i % styles.length]!;
    return createAvatar(style as Parameters<typeof createAvatar>[0], {
      seed: randomSeed(),
      size: 192,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
      ...options,
    }).toDataUri();
  });
}

/** Random foods on a colour, like the pictures behind aliases, as JPEG data URLs. */
export function suggestFoods(count = 5): string[] {
  return Array.from({ length: count }, () => {
    const color = randomAlias();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    const g = canvas.getContext("2d")!;
    g.fillStyle = color;
    g.fillRect(0, 0, 192, 192);
    g.font = "104px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(aliasAvatar(color)!.food, 96, 104);
    return canvas.toDataURL("image/jpeg", 0.9);
  });
}
