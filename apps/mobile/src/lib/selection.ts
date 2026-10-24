import { create } from "zustand";

interface SelectionState {
  chatId: string | null;
  ids: string[];
  start: (chatId: string, id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  chatId: null,
  ids: [],
  start: (chatId, id) => set({ chatId, ids: [id] }),
  toggle: (id) =>
    set((s) => {
      const ids = s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id];
      return ids.length ? { ids } : { ids, chatId: null };
    }),
  clear: () => set({ chatId: null, ids: [] }),
}));
