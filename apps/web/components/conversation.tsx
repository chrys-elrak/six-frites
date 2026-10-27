"use client";

import { type MessageDTO, durationLabel, isMuted } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Lock, MoreVertical, Phone, ShieldAlert, Trash2, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteMessages } from "@/lib/actions";
import { startCall, useCall } from "@/lib/call";
import { useIdentityChanges } from "@/lib/e2ee";
import { useChat, useMessages } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSelection } from "@/lib/selection";
import { presenceLabel, usePresence, useWatchPresence } from "@/lib/presence";
import { sendAtLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useTyping } from "@/lib/typing";
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
  const tr = useT();
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
  const typing = useTyping(chatId);
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
    return (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? tr.common.someone));
  }, [members, meId, tr]);
  const peerId = members?.find((m) => m.user.id !== meId)?.user.id;
  const presence = usePresence(peerId);
  const inCall = useCall((s) => s.call !== null);
  const keysChanged = useIdentityChanges((s) => !!peerId && !!s.changed[peerId]);
  const dismissKeys = useIdentityChanges((s) => s.dismiss);
  useWatchPresence(peerId ? [peerId] : []);

  if (chat.isPending) {
    return <div className="grid h-full place-items-center text-sm text-stone-500">{tr.common.loading}</div>;
  }
  if (!chat.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium">{tr.chat.notFound}</p>
          <Link href="/" className="text-sm text-stone-500 underline">
            {tr.common.backToChats}
          </Link>
        </div>
      </div>
    );
  }

  const c = chat.data;
  const peer = c.members.find((m) => m.user.id !== meId)?.user ?? c.members[0]!.user;
  const muted = isMuted(c);
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
          <button onClick={clearSelection} aria-label={tr.chat.cancelSelection} className={iconButton}>
            <X className="size-5" />
          </button>
          <p className="min-w-0 flex-1 font-semibold">{tr.chat.selected(count)}</p>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={count === 0}
            aria-label={tr.chat.deleteSelected}
            className={`${iconButton} text-red-600 disabled:opacity-40 dark:text-red-400`}
          >
            <Trash2 className="size-5" />
          </button>
        </header>
      ) : (
        <header className={headerClass}>
          <Link
            href={c.archived ? "/archived" : "/"}
            aria-label={tr.common.backToChats}
            className={`${iconButton} md:hidden`}
          >
            <ChevronLeft className="size-6" />
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-0.5 pr-2 text-left hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
            aria-label={tr.chat.editContact(c.title)}
          >
            <Avatar user={peer} online={shownPresence?.online} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 font-semibold">
                <span className="truncate">{c.title}</span>
                {c.encrypted && <Lock className="size-3.5 shrink-0 text-stone-400" aria-label={tr.chat.encrypted} />}
              </span>
              {typing ? (
                <span className="block text-xs font-medium text-brand">{tr.chats.typing[typing]}</span>
              ) : (
                (shownPresence || muted || c.archived || c.autoDeleteSecs) && (
                  <span className="block truncate text-xs text-stone-500">
                    {shownPresence?.online && <span className="font-medium text-brand">{tr.time.online}</span>}
                    {shownPresence?.online && (muted || c.archived || c.autoDeleteSecs) && " · "}
                    {[
                      !shownPresence?.online && presenceLabel(shownPresence),
                      c.autoDeleteSecs && tr.chat.autoDelete(durationLabel(c.autoDeleteSecs, tr)),
                      muted && (c.mutedUntil ? tr.chat.mutedUntil(sendAtLabel(c.mutedUntil)) : tr.common.muted),
                      c.archived && tr.common.archived,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )
              )}
            </span>
          </button>
          {!frozen && (
            <>
              <button
                onClick={() => void startCall(c, meId, false)}
                disabled={inCall || !realtime}
                aria-label={tr.chat.voiceCall}
                className={`${iconButton} disabled:opacity-40`}
              >
                <Phone className="size-5" />
              </button>
              <button
                onClick={() => void startCall(c, meId, true)}
                disabled={inCall || !realtime}
                aria-label={tr.chat.videoCall}
                className={`${iconButton} disabled:opacity-40`}
              >
                <Video className="size-5" />
              </button>
            </>
          )}
          <button onClick={() => setMenu(true)} aria-label={tr.chat.options} className={iconButton}>
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
      {!selecting && keysChanged && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <ShieldAlert className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            {tr.chat.securityCodeChanged(peer.displayName)}
          </p>
          <button onClick={() => setEditing(true)} className="shrink-0 font-semibold underline-offset-2 hover:underline">
            {tr.chat.verify}
          </button>
          <button
            onClick={() => dismissKeys(peer.id)}
            aria-label={tr.common.dismiss}
            className="shrink-0 rounded-full p-1"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
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
          title={tr.chat.deleteMessages(count)}
          onClose={() => setConfirmDelete(false)}
          actions={[
            ...(c.type === "direct"
              ? [
                  {
                    label: tr.chat.deleteForMeAnd(peer.displayName),
                    destructive: true,
                    onSelect: () => removeSelected("all"),
                  },
                ]
              : []),
            { label: tr.chat.deleteForMe, destructive: true, onSelect: () => removeSelected("me") },
          ]}
        />
      )}
    </div>
  );
}
