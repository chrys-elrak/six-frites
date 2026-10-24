const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "fde68a", "bbf7d0", "fecaca"];

const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Generates avatar suggestions locally with DiceBear, using only CC0-licensed styles. */
export async function suggestAvatars(count = 12): Promise<string[]> {
  const [{ createAvatar }, { notionists, lorelei, openPeeps, thumbs, pixelArt }] = await Promise.all([
    import("@dicebear/core"),
    import("@dicebear/collection"),
  ]);
  const styles = [notionists, lorelei, openPeeps, thumbs, pixelArt];
  return Array.from({ length: count }, (_, i) =>
    createAvatar(styles[i % styles.length] as Parameters<typeof createAvatar>[0], {
      seed: randomSeed(),
      size: 192,
      backgroundColor: BACKGROUNDS,
      backgroundType: ["solid"],
    }).toDataUri(),
  );
}
