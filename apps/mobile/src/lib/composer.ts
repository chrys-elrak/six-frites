import type { MessageDTO } from "@six/shared";
import { create } from "zustand";
import type { LocalFile } from "./send";

/** Editing a photo message can carry the marked-up photo that will replace it. */
export type ComposerMode = { kind: "reply"; message: MessageDTO } | { kind: "edit"; message: MessageDTO; photo?: LocalFile };

interface ComposerState {
  byChat: Record<string, ComposerMode | undefined>;
  set: (chatId: string, mode: ComposerMode | undefined) => void;
  /** A photo handed to a chat's composer to edit and send again. */
  handed: Record<string, LocalFile | undefined>;
  hand: (chatId: string, file: LocalFile | undefined) => void;
}

export const useComposerMode = create<ComposerState>((set) => ({
  byChat: {},
  set: (chatId, mode) => set((s) => ({ byChat: { ...s.byChat, [chatId]: mode } })),
  handed: {},
  hand: (chatId, file) => set((s) => ({ handed: { ...s.handed, [chatId]: file } })),
}));
