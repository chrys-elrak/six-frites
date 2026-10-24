import type { ReplyPreview } from "@six/shared";
import { create } from "zustand";

export interface PendingMessage {
  clientId: string;
  chatId: string;
  text: string;
  replyTo: ReplyPreview | null;
  createdAt: string;
  status: "sending" | "failed";
}

interface OutboxState {
  byChat: Record<string, PendingMessage[]>;
  add: (m: PendingMessage) => void;
  setStatus: (chatId: string, clientId: string, status: PendingMessage["status"]) => void;
  remove: (chatId: string, clientId: string) => void;
}

export const useOutbox = create<OutboxState>((set) => ({
  byChat: {},
  add: (m) => set((s) => ({ byChat: { ...s.byChat, [m.chatId]: [...(s.byChat[m.chatId] ?? []), m] } })),
  setStatus: (chatId, clientId, status) =>
    set((s) => ({
      byChat: {
        ...s.byChat,
        [chatId]: (s.byChat[chatId] ?? []).map((m) => (m.clientId === clientId ? { ...m, status } : m)),
      },
    })),
  remove: (chatId, clientId) =>
    set((s) => ({
      byChat: { ...s.byChat, [chatId]: (s.byChat[chatId] ?? []).filter((m) => m.clientId !== clientId) },
    })),
}));

const EMPTY: PendingMessage[] = [];
export const usePending = (chatId: string) => useOutbox((s) => s.byChat[chatId] ?? EMPTY);
