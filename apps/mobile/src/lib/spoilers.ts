import { create } from "zustand";

interface SpoilerState {
  revealed: Record<string, true>;
  reveal: (key: string) => void;
  /** Hides everything again, when you leave a chat. */
  forget: () => void;
}

export const useSpoilers = create<SpoilerState>((set) => ({
  revealed: {},
  reveal: (key) => set((s) => ({ revealed: { ...s.revealed, [key]: true } })),
  forget: () => set({ revealed: {} }),
}));
