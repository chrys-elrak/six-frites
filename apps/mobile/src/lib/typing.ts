import { create } from "zustand";

const TTL = 6000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

interface TypingState {
  byChat: Record<string, string[]>;
  set: (chatId: string, userId: string, typing: boolean) => void;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  byChat: {},
  set(chatId, userId, typing) {
    const key = `${chatId}:${userId}`;
    clearTimeout(timers.get(key));
    timers.delete(key);
    if (typing) timers.set(key, setTimeout(() => get().set(chatId, userId, false), TTL));

    const current = get().byChat[chatId] ?? [];
    const has = current.includes(userId);
    if (typing === has) return;
    const next = typing ? [...current, userId] : current.filter((id) => id !== userId);
    set((s) => ({ byChat: { ...s.byChat, [chatId]: next } }));
  },
}));

export const useIsTyping = (chatId: string) => useTypingStore((s) => (s.byChat[chatId]?.length ?? 0) > 0);
