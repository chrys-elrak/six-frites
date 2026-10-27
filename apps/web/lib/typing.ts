import type { TypingKind } from "@six/shared";
import { create } from "zustand";

const TTL = 6000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

interface TypingState {
  byChat: Record<string, Record<string, TypingKind>>;
  set: (chatId: string, userId: string, kind: TypingKind | null) => void;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  byChat: {},
  set(chatId, userId, kind) {
    const key = `${chatId}:${userId}`;
    clearTimeout(timers.get(key));
    timers.delete(key);
    if (kind) timers.set(key, setTimeout(() => get().set(chatId, userId, null), TTL));

    const { [userId]: was = null, ...others } = get().byChat[chatId] ?? {};
    if (was === kind) return;
    set((s) => ({ byChat: { ...s.byChat, [chatId]: kind ? { ...others, [userId]: kind } : others } }));
  },
}));

export const useTyping = (chatId: string) =>
  useTypingStore((s) => Object.values(s.byChat[chatId] ?? {})[0] ?? null);
