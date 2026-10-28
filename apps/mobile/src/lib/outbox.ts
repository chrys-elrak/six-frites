import type {
  Checklist,
  EncryptedFile,
  EphemeralInput,
  GeoPoint,
  GifDTO,
  MessageEntity,
  ReplyPreview,
  UploadKind,
} from "@six/shared";
import { useMemo } from "react";
import { create } from "zustand";

export interface PendingAttachment {
  kind: UploadKind;
  name: string;
  mime: string;
  size: number;
  localUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sticker?: boolean;
  progress: number;
  uploadId: string | null;
  /** Set once an encrypted copy was uploaded: what the recipient needs to decrypt it. */
  file?: EncryptedFile;
}

export interface PendingMessage {
  clientId: string;
  chatId: string;
  text: string;
  entities: MessageEntity[];
  replyTo: ReplyPreview | null;
  spoiler: boolean;
  ephemeral: EphemeralInput | null;
  attachment: PendingAttachment | null;
  gif?: GifDTO;
  location?: GeoPoint;
  checklist?: Checklist;
  groupId?: string;
  sendAt?: string;
  createdAt: string;
  status: "sending" | "failed";
}

interface OutboxState {
  byChat: Record<string, PendingMessage[]>;
  add: (m: PendingMessage) => void;
  setStatus: (chatId: string, clientId: string, status: PendingMessage["status"]) => void;
  patchAttachment: (chatId: string, clientId: string, patch: Partial<PendingAttachment>) => void;
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
  patchAttachment: (chatId, clientId, patch) =>
    set((s) => ({
      byChat: {
        ...s.byChat,
        [chatId]: (s.byChat[chatId] ?? []).map((m) =>
          m.clientId === clientId && m.attachment ? { ...m, attachment: { ...m.attachment, ...patch } } : m,
        ),
      },
    })),
  remove: (chatId, clientId) =>
    set((s) => ({
      byChat: { ...s.byChat, [chatId]: (s.byChat[chatId] ?? []).filter((m) => m.clientId !== clientId) },
    })),
}));

const EMPTY: PendingMessage[] = [];
/** Pending messages to show in the chat; a scheduled one only shows if it failed, to retry it. */
export function usePending(chatId: string) {
  const all = useOutbox((s) => s.byChat[chatId] ?? EMPTY);
  return useMemo(() => all.filter((m) => !m.sendAt || m.status === "failed"), [all]);
}
