import type { MessageDTO } from "@six/shared";
import { create } from "zustand";

export type ComposerMode = { kind: "reply"; message: MessageDTO } | { kind: "edit"; message: MessageDTO };

interface ComposerState {
  byChat: Record<string, ComposerMode | undefined>;
  set: (chatId: string, mode: ComposerMode | undefined) => void;
}

export const useComposerMode = create<ComposerState>((set) => ({
  byChat: {},
  set: (chatId, mode) => set((s) => ({ byChat: { ...s.byChat, [chatId]: mode } })),
}));
