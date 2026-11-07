export type Gender = "female" | "male";

export const randomGender = (): Gender => (Math.random() < 0.5 ? "female" : "male");

const short = Array.from({ length: 24 }, (_, i) => `short${String(i + 1).padStart(2, "0")}`);
const long = Array.from({ length: 21 }, (_, i) => `long${String(i + 1).padStart(2, "0")}`);

/** DiceBear options that make the CC0 head styles (open-peeps, pixel-art) look like a girl or a boy. */
export const GENDER_LOOKS = {
  female: {
    openPeeps: {
      head: ["bangs", "bangs2", "bantuKnots", "bun", "bun2", "buns", "grayBun", "hijab", "long", "longAfro", "longBangs", "longCurly", "mediumBangs", "mediumBangs2", "mediumBangs3", "mediumStraight"],
      facialHairProbability: 0,
    },
    pixelArt: { hair: long, beardProbability: 0 },
  },
  male: {
    openPeeps: {
      head: ["short1", "short2", "short3", "short4", "short5", "flatTop", "pomp", "shaved1", "shaved2", "shaved3", "noHair1", "noHair2", "grayShort", "mohawk", "cornrows"],
      facialHairProbability: 40,
    },
    pixelArt: { hair: short, beardProbability: 30 },
  },
} as const;
