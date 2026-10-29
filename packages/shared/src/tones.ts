export const TONES = ["chime", "pop", "ding", "marimba", "drop", "trio"] as const;
export type Tone = (typeof TONES)[number];
