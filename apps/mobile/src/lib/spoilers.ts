import { create } from "zustand";

interface SpoilerState {
  revealed: Record<string, true>;
  reveal: (key: string) => void;
}

export const useSpoilers = create<SpoilerState>((set) => ({
  revealed: {},
  reveal: (key) => set((s) => ({ revealed: { ...s.revealed, [key]: true } })),
}));
