export const TONES = ["frites", "chime", "pop", "ding", "marimba", "drop", "trio", "blip"] as const;
export type Tone = (typeof TONES)[number];
