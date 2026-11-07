import { create } from "zustand";

/** The most messages picked at once. */
export const MAX_SELECTED = 25;

interface SelectionState {
  chatId: string | null;
  ids: string[];
  start: (chatId: string, id: string) => void;
  toggle: (id: string) => void;
  /** Replaces the picked messages, keeping the first MAX_SELECTED. */
  set: (ids: string[]) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  chatId: null,
  ids: [],
  start: (chatId, id) => set({ chatId, ids: [id] }),
  toggle: (id) =>
    set((s) => {
      if (!s.ids.includes(id) && s.ids.length >= MAX_SELECTED) return s;
      const ids = s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id];
      return ids.length ? { ids } : { ids, chatId: null };
    }),
  set: (ids) => set({ ids: [...new Set(ids)].slice(0, MAX_SELECTED) }),
  clear: () => set({ chatId: null, ids: [] }),
}));
