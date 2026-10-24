"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteChat, updateChatSettings } from "@/lib/actions";
import { useChat } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { MessageList, type MessageListHandle } from "./message-list";
import { Sheet } from "./sheet";

export function Conversation({ chatId }: { chatId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const { realtime } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState<"chat" | "delete" | null>(null);

  useEffect(() => {
    setActiveChat(chatId);
    return () => setActiveChat(null);
  }, [chatId]);

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
  const settings = (input: Parameters<typeof updateChatSettings>[2]) => void updateChatSettings(qc, chatId, input);

  async function remove(scope: "me" | "all") {
    await deleteChat(qc, chatId, scope);
    if (scope === "me") router.replace("/");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 bg-stone-50/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <Link
          href={c.archived ? "/archived" : "/"}
          aria-label="Back to chats"
          className="grid size-10 place-items-center rounded-full text-2xl hover:bg-stone-200 md:hidden dark:hover:bg-stone-800"
        >
          ‹
        </Link>
        <Avatar user={peer} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.title}</p>
          {(c.muted || c.archived) && (
            <p className="text-xs text-stone-500">{[c.muted && "Muted", c.archived && "Archived"].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button
          onClick={() => setMenu("chat")}
          aria-label="Chat options"
          className="grid size-10 place-items-center rounded-full text-xl text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          ⋯
        </button>
      </header>

      <MessageList ref={list} chat={c} meId={meId} onSeen={onSeen} />
      <Composer
        chatId={chatId}
        nameOf={nameOf}
        onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())}
      />

      {menu === "chat" && (
        <Sheet
          title={c.title}
          onClose={() => setMenu(null)}
          actions={[
            { label: c.pinned ? "Unpin" : "Pin", onSelect: () => settings({ pinned: !c.pinned }) },
            { label: c.muted ? "Unmute" : "Mute", onSelect: () => settings({ muted: !c.muted }) },
            { label: c.archived ? "Unarchive" : "Archive", onSelect: () => settings({ archived: !c.archived }) },
            { label: "Delete chat", destructive: true, onSelect: () => setMenu("delete") },
          ]}
        />
      )}
      {menu === "delete" && (
        <Sheet
          title="Delete this chat?"
          onClose={() => setMenu(null)}
          actions={[
            { label: "Delete for me", destructive: true, onSelect: () => void remove("me") },
            {
              label: `Delete all messages for me and ${peer.displayName}`,
              destructive: true,
              onSelect: () => void remove("all"),
            },
          ]}
        />
      )}
    </div>
  );
}
