import type {
  Checklist,
  EncryptedFile,
  EphemeralInput,
  GeoPoint,
  GifDTO,
  MessageEntity,
  ReplyPreview,
  StickerDTO,
  UploadKind,
} from "@six/shared";
import { create } from "zustand";

export interface PendingAttachment {
  kind: UploadKind;
  name: string;
  mime: string;
  size: number;
  localUrl: string;
  width: number | null;
  height: number | null;
  progress: number;
  uploadId: string | null;
  sticker?: boolean;
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
  gif: GifDTO | null;
  sticker: StickerDTO | null;
  location?: GeoPoint;
  checklist?: Checklist;
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
export const usePending = (chatId: string) => useOutbox((s) => s.byChat[chatId] ?? EMPTY);

/** The raw files behind pending attachments, kept outside the store because they are not serializable. */
export const pendingFiles = new Map<string, Blob>();

/** Encrypted copies of pending files and the keys inside them, so a retry sends the same upload. */
export const sealedFiles = new Map<string, { file: EncryptedFile; blob: Blob }>();
