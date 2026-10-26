"use client";

import { type MessageDTO, durationLabel } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MoreVertical, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteMessages } from "@/lib/actions";
import { useChat, useMessages } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSelection } from "@/lib/selection";
import { presenceLabel, usePresence, useWatchPresence } from "@/lib/presence";
import { useSession } from "@/lib/session";
import { useIsTyping } from "@/lib/typing";
import { Avatar } from "./avatar";
import { BubbleColors, ChatBackground } from "./chat-background";
import { ChatBlocked } from "./chat-blocked";
import { ChatMenu } from "./chat-menu";
import { Composer } from "./composer";
import { ContactEditor } from "./contact-editor";
import { MessageList, type MessageListHandle } from "./message-list";
import { Sheet } from "./sheet";

const headerClass =
  "flex items-center gap-2 border-b border-stone-200 bg-stone-50/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:pt-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90";
const iconButton =
  "grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800";

export function Conversation({ chatId }: { chatId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const messages = useMessages(chatId);
  const { realtime } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typing = useIsTyping(chatId);
  const selecting = useSelection((s) => s.chatId === chatId);
  const selectedIds = useSelection((s) => s.ids);
  const clearSelection = useSelection((s) => s.clear);

  useEffect(() => {
    setActiveChat(chatId);
    return () => {
      setActiveChat(null);
      useSelection.getState().clear();
    };
  }, [chatId]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clearSelection();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, clearSelection]);

  const unread = chat.data?.unreadCount ?? 0;
  const onSeen = useCallback(() => {
    if (unread > 0 && realtime && document.visibilityState === "visible") {
      void realtime.markRead(chatId).catch(() => null);
    }
  }, [unread, realtime, chatId]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && onSeen();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onSeen]);

  const members = chat.data?.members;
  const nameOf = useMemo(() => {
    const names = new Map(members?.map((m) => [m.user.id, m.user.displayName]));
    return (id: string) => (id === meId ? "You" : (names.get(id) ?? "Someone"));
  }, [members, meId]);
  const peerId = members?.find((m) => m.user.id !== meId)?.user.id;
  const presence = usePresence(peerId);
  useWatchPresence(peerId ? [peerId] : []);

  if (chat.isPending) return <div className="grid h-full place-items-center text-sm text-stone-500">Loading…</div>;
  if (!chat.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium">Chat not found</p>
          <Link href="/" className="text-sm text-stone-500 underline">
            Back to chats
          </Link>
        </div>
      </div>
    );
  }

  const c = chat.data;
  const peer = c.members.find((m) => m.user.id !== meId)?.user ?? c.members[0]!.user;
  const frozen = c.blockedByMe || c.blockedByThem || c.peerDeleted;
  const shownPresence = frozen ? undefined : presence;
  const count = selecting ? selectedIds.length : 0;

  function removeSelected(scope: "me" | "all") {
    const byId = new Map<string, MessageDTO>(
      (messages.data?.pages.flatMap((p) => p.items) ?? []).map((m) => [m.id, m]),
    );
    const chosen = selectedIds.map((id) => byId.get(id)).filter((m): m is MessageDTO => !!m);
    clearSelection();
    void deleteMessages(qc, chatId, chosen, scope).catch(() => null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selecting ? (
        <header className={headerClass}>
          <button onClick={clearSelection} aria-label="Cancel selection" className={iconButton}>
            <X className="size-5" />
          </button>
          <p className="min-w-0 flex-1 font-semibold">{count} selected</p>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={count === 0}
            aria-label="Delete selected messages"
            className={`${iconButton} text-red-600 disabled:opacity-40 dark:text-red-400`}
          >
            <Trash2 className="size-5" />
          </button>
        </header>
      ) : (
        <header className={headerClass}>
          <Link href={c.archived ? "/archived" : "/"} aria-label="Back to chats" className={`${iconButton} md:hidden`}>
            <ChevronLeft className="size-6" />
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-0.5 pr-2 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
            aria-label={`Edit contact ${c.title}`}
          >
            <Avatar user={peer} online={shownPresence?.online} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.title}</span>
              {typing ? (
                <span className="block text-xs font-medium text-brand">typing…</span>
              ) : (
                (shownPresence || c.muted || c.archived || c.autoDeleteSecs) && (
                  <span className="block truncate text-xs text-stone-500">
                    {shownPresence?.online && <span className="font-medium text-brand">online</span>}
                    {shownPresence?.online && (c.muted || c.archived || c.autoDeleteSecs) && " · "}
                    {[
                      !shownPresence?.online && presenceLabel(shownPresence),
                      c.autoDeleteSecs && `Auto-delete: ${durationLabel(c.autoDeleteSecs)}`,
                      c.muted && "Muted",
                      c.archived && "Archived",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )
              )}
            </span>
          </button>
          <button onClick={() => setMenu(true)} aria-label="Chat options" className={iconButton}>
            <MoreVertical className="size-5" />
          </button>
        </header>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatBackground themeId={c.theme} />
        <BubbleColors themeId={c.theme} scope="chat-bubbles" />
        <div className="chat-bubbles relative flex min-h-0 flex-1 flex-col">
          <MessageList ref={list} chat={c} meId={meId} onSeen={onSeen} />
        </div>
      </div>
      {!selecting && frozen && <ChatBlocked chat={c} peerId={peer.id} peerName={peer.displayName} />}
      {!selecting && !frozen && (
        <Composer
          chatId={chatId}
          nameOf={nameOf}
          scheduledCount={c.scheduledCount}
          onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())}
        />
      )}

      {menu && (
        <ChatMenu
          chat={c}
          peerName={peer.displayName}
          onClose={() => setMenu(false)}
          onDeleted={(scope) => scope === "me" && router.replace("/")}
        />
      )}
      {editing && <ContactEditor userId={peer.id} onClose={() => setEditing(false)} />}
      {confirmDelete && (
        <Sheet
          title={`Delete ${count} message${count === 1 ? "" : "s"}?`}
          onClose={() => setConfirmDelete(false)}
          actions={[
            ...(c.type === "direct"
              ? [
                  {
                    label: `Delete for me and ${peer.displayName}`,
                    destructive: true,
                    onSelect: () => removeSelected("all"),
                  },
                ]
              : []),
            { label: "Delete for me", destructive: true, onSelect: () => removeSelected("me") },
          ]}
        />
      )}
    </div>
  );
}
