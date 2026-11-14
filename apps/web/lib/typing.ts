import { type ChatDTO, type TypingKind, typingLabel } from "@six/shared";
import { useT } from "./i18n";
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

/** What the chat shows while people in it type or record, saying who in a group; null when nobody does. */
export function useTyping(chat: Pick<ChatDTO, "id" | "group" | "members"> | undefined) {
  const tr = useT();
  const typers = useTypingStore((s) => (chat ? s.byChat[chat.id] : undefined));
  return chat && typers ? typingLabel(chat, Object.entries(typers), tr) : null;
}
