import type {
  ChatGame,
  Checklist,
  Poll,
  EncryptedFile,
  EphemeralInput,
  GeoPoint,
  GifDTO,
  MessageEntity,
  ReplyPreview,
  StickerDTO,
  UploadKind,
  StoryReply,
  CommentRule,
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
  progress: number;
  uploadId: string | null;
  sticker?: boolean;
  disguised?: boolean;
}

export interface PendingMessage {
  clientId: string;
  chatId: string;
  text: string;
  entities: MessageEntity[];
  replyTo: ReplyPreview | null;
  story?: StoryReply;
  spoiler: boolean;
  silent?: boolean;
  bump?: boolean;
  ephemeral: EphemeralInput | null;
  attachment: PendingAttachment | null;
  gif: GifDTO | null;
  sticker: StickerDTO | null;
  location?: GeoPoint;
  checklist?: Checklist;
  poll?: Poll;
  pollVisible?: boolean;
  game?: ChatGame;
  groupId?: string;
  /** In a group: the message this one comments on, and what an admin set for its comments. */
  threadId?: string;
  comments?: CommentRule;
  sendAt?: string;
  createdAt: string;
  /** `waiting` for the network: it goes out by itself when the connection is back. */
  status: "sending" | "waiting" | "failed";
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
/** Pending messages to show in the chat; a scheduled one only shows once it's stuck, to retry it. */
/** What's still on its way to a chat, or with `threadId` to the comments on one of its messages. */
export function usePending(chatId: string, threadId?: string) {
  const all = useOutbox((s) => s.byChat[chatId] ?? EMPTY);
  return useMemo(
    () => all.filter((m) => (!m.sendAt || m.status !== "sending") && m.threadId === threadId),
    [all, threadId],
  );
}

/** The raw files behind pending attachments, kept outside the store because they are not serializable. */
export const pendingFiles = new Map<string, Blob>();

/** Encrypted copies of pending files and the keys inside them, so a retry sends the same upload. */
export const sealedFiles = new Map<string, { file: EncryptedFile; blob: Blob }>();
