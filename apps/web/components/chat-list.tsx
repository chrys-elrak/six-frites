"use client";

import { type ChatDTO, isMuted, maskSpoilers, serviceText, shownType } from "@six/shared";
import {
  Archive,
  Ban,
  BellOff,
  ChevronLeft,
  EyeOff,
  Flame,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Search,
  Share2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { setArchiveOpen, useAppLock } from "@/lib/app-lock";
import { useChats } from "@/lib/chats";
import type { Hydrated } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { usePresence, useWatchPresence } from "@/lib/presence";
import { formatDuration, listTime } from "@/lib/format";
import { useLongPress } from "@/lib/long-press";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useTyping } from "@/lib/typing";
import { AdBanner } from "./ad-banner";
import { LockScreen } from "./app-lock";
import { useDrafts } from "@/lib/drafts";
import { AddContact } from "./add-contact";
import { Avatar } from "./avatar";
import { ChatMenu } from "./chat-menu";
import { NewInviteDialog } from "./invites";
import { MediaLabel } from "./message-list";
import { ServiceIcon, callLabel } from "./service-icon";

function Preview({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const tr = useT();
  const m = chat.lastMessage;
  if (!m) return <>{tr.chats.noMessages}</>;
  if (m.deletedAt) {
    return (
      <span className="inline-flex items-center gap-1 italic">
        <Ban className="size-3.5" /> {tr.summary.messageDeleted}
      </span>
    );
  }
  if (m.ephemeral) {
    return (
      <span className="inline-flex items-center gap-1">
        {m.senderId === meId && tr.chats.youPrefix}
        <Flame className="size-3.5 shrink-0 text-orange-500" />
        {m.ephemeral.expired ? tr.chats.opened : tr.chats.selfDestructing[m.type]}
      </span>
    );
  }
  if (m.type === "service") {
    return (
      <span className="inline-flex items-center gap-1">
        <ServiceIcon action={m.action} />{" "}
        {m.action?.type === "call" ? callLabel(m.action, m.senderId === meId, tr) : serviceText(m, tr)}
      </span>
    );
  }
  if ((m as Hydrated).undecryptable && m.type === "text") {
    return (
      <span className="inline-flex items-center gap-1 italic">
        {m.senderId === meId && tr.chats.youPrefix}
        <Lock className="size-3.5" /> {tr.chats.encryptedMessage}
      </span>
    );
  }
  if (m.type !== "text") {
    const voiceLength =
      m.type === "voice" && m.attachment?.durationMs ? ` (${formatDuration(m.attachment.durationMs)})` : "";
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        {m.senderId === meId && tr.chats.youPrefix}
        {m.sticker?.emoji}
        <MediaLabel type={shownType(m as Hydrated)} />
        {voiceLength}
        {m.type === "file" && m.attachment && !m.text && <span className="truncate">· {m.attachment.name}</span>}
        {m.type === "checklist" && m.checklist && <span className="truncate">· {m.checklist.title}</span>}
        {m.text && <span className="truncate">· {maskSpoilers(m.text, m.entities)}</span>}
      </span>
    );
  }
  return (
    <>
      {m.senderId === meId && tr.chats.youPrefix}
      {m.spoiler ? (
        <span className="inline-flex items-center gap-1 italic">
          <EyeOff className="size-3.5" /> {tr.summary.spoiler}
        </span>
      ) : (
        maskSpoilers(m.text ?? "", m.entities)
      )}
    </>
  );
}

function ChatRow({ chat, meId, active }: { chat: ChatDTO; meId: string; active: boolean }) {
  const tr = useT();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const press = useLongPress(() => setMenu(true));
  const typing = useTyping(chat.id);
  const draft = useDrafts((s) => (active ? undefined : s.byChat[chat.id]));
  const peer = chat.members.find((m) => m.user.id !== meId)?.user ?? chat.members[0]!.user;
  const frozen = chat.blockedByMe || chat.blockedByThem || chat.peerDeleted;
  const online = usePresence(peer.id === meId || frozen ? undefined : peer.id)?.online;
  const unread = chat.unreadCount > 0;

  return (
    <div className="group relative">
      <Link
        href={`/chats/${chat.id}`}
        {...press}
        className={`flex items-center gap-3 px-4 py-3 transition [-webkit-touch-callout:none] active:bg-stone-100 pointer-coarse:select-none dark:active:bg-stone-800 ${
          active ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-50 dark:hover:bg-stone-900"
        }`}
      >
        <Avatar user={peer} size="md" online={online} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate font-semibold">{chat.title}</p>
            {isMuted(chat) && <BellOff aria-label={tr.common.muted} className="size-3.5 shrink-0 text-stone-400" />}
            <span className={`shrink-0 text-xs ${unread ? "font-semibold text-brand" : "text-stone-500"}`}>
              {listTime(chat.lastActivityAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-sm ${
                typing
                  ? "font-medium text-brand"
                  : unread
                    ? "text-stone-900 dark:text-stone-100"
                    : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {typing ? (
                tr.chats.typing[typing]
              ) : draft ? (
                <>
                  <span className="text-red-600 dark:text-red-400">{tr.chats.draft}</span> {draft}
                </>
              ) : (
                <Preview chat={chat} meId={meId} />
              )}
            </p>
            {chat.pinned && !unread && (
              <Pin aria-label={tr.chats.pinned} className="size-3.5 shrink-0 rotate-45 text-stone-400" />
            )}
            {unread && (
              <span
                className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-bold ${
                  isMuted(chat)
                    ? "bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                    : "bg-brand text-brand-ink"
                }`}
              >
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={() => setMenu(true)}
        aria-label={tr.chats.optionsFor(chat.title)}
        className="absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-stone-500 opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:bg-stone-800/90"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <ChatMenu
          chat={chat}
          peerName={peer.displayName}
          onClose={() => setMenu(false)}
          onDeleted={(scope) => scope === "me" && active && router.replace("/")}
        />
      )}
    </div>
  );
}

/**
 * The chat list, or with `archived` the archived chats behind the app lock code. The archived row sits
 * just above the top of the list, so it only shows when the list is pulled down.
 */
export function ChatList({ archived = false }: { archived?: boolean }) {
  const tr = useT();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const hasAppLock = useSession((s) => s.user!.hasAppLock);
  const archiveOpen = useAppLock((s) => s.archiveOpen);
  const chats = useChats(archived);
  const archivedChats = useChats(true);
  const { status } = useRealtime();
  const pathname = usePathname();
  const statusText = {
    connecting: tr.common.connecting,
    syncing: tr.chats.updating,
    offline: tr.chats.waitingForNetwork,
    live: null,
  }[status];

  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"add" | "invite" | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = chats.data?.filter((c) => c.title.toLowerCase().includes(needle)) ?? [];
  const archivedCount = archivedChats.data?.length ?? 0;
  const showArchive = !archived && !needle && archivedCount > 0;
  const scroller = useRef<HTMLDivElement>(null);
  const archiveRow = useRef<HTMLAnchorElement>(null);
  useWatchPresence(visible.flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId));

  useEffect(() => {
    if (pathname === "/") setArchiveOpen(false);
  }, [pathname]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const row = archiveRow.current;
    if (el && row && el.scrollTop < row.offsetHeight) el.scrollTop = row.offsetHeight;
  }, [showArchive, pathname]);

  if (archived && hasAppLock && !archiveOpen) {
    return (
      <LockScreen title={tr.common.archived} onUnlock={() => setArchiveOpen(true)} onCancel={() => router.push("/")} />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        {archived && (
          <Link
            href="/"
            aria-label={tr.common.backToChats}
            className="-ml-2 grid size-9 place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="size-6" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{archived ? tr.common.archived : tr.common.chats}</h1>
          {statusText && <p className="text-xs text-stone-500">{statusText}</p>}
        </div>
        {!archived && (
          <>
            <button
              onClick={() => setDialog("invite")}
              aria-label={tr.contacts.inviteFriend}
              title={tr.contacts.inviteFriend}
              className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
            >
              <Share2 className="size-5" />
            </button>
            <button
              onClick={() => setDialog("add")}
              aria-label={tr.contacts.addContact}
              title={tr.contacts.addContact}
              className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
            >
              <UserPlus className="size-5" />
            </button>
          </>
        )}
        <label className="flex w-full items-center gap-2 rounded-xl bg-stone-200/70 px-3 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-800">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr.contacts.search}
            aria-label={tr.contacts.search}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-stone-900 outline-none placeholder:text-stone-500 md:text-sm dark:text-stone-100"
          />
        </label>
      </header>
      {dialog === "add" && <AddContact onClose={() => setDialog(null)} />}
      {dialog === "invite" && <NewInviteDialog onClose={() => setDialog(null)} />}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={showArchive ? "min-h-[calc(100%+5rem)]" : undefined}>
          {showArchive && (
            <Link
              ref={archiveRow}
              href="/archived"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900"
            >
              <span className="grid size-14 place-items-center rounded-full bg-stone-200/70 text-stone-500 dark:bg-stone-800">
                <Archive className="size-5" />
              </span>
              <span className="flex-1">{tr.common.archived}</span>
              <span className="text-stone-500">{archivedCount}</span>
            </Link>
          )}
          {chats.isPending && <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>}
          {chats.isError && <p className="p-4 text-sm text-red-600">{tr.chats.couldNotLoad}</p>}
          {chats.isSuccess && needle && visible.length === 0 && (
            <p className="p-8 text-center text-sm text-stone-500">{tr.contacts.noMatch(query.trim())}</p>
          )}
          {chats.isSuccess && !needle && visible.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
                {archived ? (
                  <Archive className="size-8" strokeWidth={1.6} />
                ) : (
                  <MessageCircle className="size-8" strokeWidth={1.6} />
                )}
              </span>
              <p className="font-medium">{archived ? tr.chats.noArchived : tr.chats.noChats}</p>
              {!archived && (
                <>
                  <p className="text-sm text-stone-500">{tr.chats.noChatsHint}</p>
                  <button
                    onClick={() => setDialog("add")}
                    className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
                  >
                    {tr.contacts.addContact}
                  </button>
                </>
              )}
            </div>
          )}
          {visible.map((c) => (
            <ChatRow key={c.id} chat={c} meId={meId} active={pathname === `/chats/${c.id}`} />
          ))}
        </div>
      </div>
      <AdBanner />
    </div>
  );
}
