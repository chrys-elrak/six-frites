"use client";

import {
  type ChatDTO,
  type ContactDTO,
  CHAT_FILTERS,
  DEFAULT_CHAT_THEME,
  chatTheme,
  type ChatFilter,
  inChatFilter,
  isFrozen,
  isMuted,
  chatFace,
  lastMessageDelivery,
  maskSpoilers,
  mentionAsYou,
  senderName,
  serviceSentence,
  serviceText,
  shownType,
  CONTACT_SORTS,
  type ContactSort,
  sortContacts,
} from "@six/shared";
import {
  AlertCircle,
  Check,
  CheckCheck,
  QrCode,
  Archive,
  ArchiveRestore,
  Ban,
  BellOff,
  ChevronLeft,
  Clock,
  EyeOff,
  Flame,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Headset,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { unwrap } from "@six/sdk";
import { BackLink, useGoUp } from "@/lib/back";
import { useOutbox } from "@/lib/outbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { six } from "@/lib/six";
import { Suspense, useEffect, useRef, useState } from "react";
import { setArchiveOpen, useAppLock } from "@/lib/app-lock";
import { useHiddenByArchive } from "@/lib/archive-lock";
import { ensureBotChat, useChats } from "@/lib/chats";
import type { Hydrated } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { presenceLabel, usePresence, usePresenceStore, useWatchPresence } from "@/lib/presence";
import { calendarDate, formatDuration, listTime } from "@/lib/format";
import { useLongPress } from "@/lib/long-press";
import { ContactEditor } from "./contact-editor";
import { Sheet } from "./sheet";
import { removeContact, updateChatSettings } from "@/lib/actions";
import { useSwipeRow } from "@/lib/swipe";
import { useRealtime } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useTyping } from "@/lib/typing";
import { useMedia } from "@/lib/viewport";
import { BrandActions } from "./brand-actions";
import { AdBanner } from "./ad-banner";
import { LockScreen } from "./app-lock";
import { receiveDraft, useDrafts } from "@/lib/drafts";
import { AddContact } from "./add-contact";
import { NewGroupDialog } from "./groups";
import { Dialog } from "./dialog";
import { Avatar } from "./avatar";
import { StoriesBar, StoryAvatar } from "./stories";
import { ChatMenu, PokeDialog } from "./chat-menu";
import { BackupPinBanner } from "./encryption-settings";
import { InstallCard } from "./install-card";
import { InviteNudge, TipCard } from "./tip-card";
import { FindMe } from "./find-me";
import { NewInviteDialog } from "./invites";
import { MediaLabel } from "./message-list";
import { ServiceIcon, callLabel } from "./service-icon";

/** Whether the chat list beside a chat shrinks to a column of avatars: on screens too narrow for both, not on phones. */
export function useChatRail() {
  const split = useMedia("(width >= 48rem)");
  const wide = useMedia("(width >= 64rem)");
  return split && !wide;
}

function Preview({ chat, meId }: { chat: ChatDTO; meId: string }) {
  const tr = useT();
  const m = chat.lastMessage;
  if (!m) return <>{tr.chats.noMessages}</>;
  const mine = m.senderId === meId;
  const who = mine ? tr.chats.youPrefix : chat.group ? `${senderName(chat, m.senderId, tr)}: ` : null;
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
        {who}
        <Flame className="size-3.5 shrink-0 text-orange-500" />
        {m.ephemeral.expired ? tr.chats.opened : tr.chats.selfDestructing[m.type]}
      </span>
    );
  }
  if (m.type === "service") {
    return (
      <span className="inline-flex items-center gap-1">
        <ServiceIcon action={m.action} />{" "}
        {m.action?.type === "call"
          ? callLabel(m.action, mine, tr)
          : chat.group
            ? serviceSentence(m, mine ? null : senderName(chat, m.senderId, tr), tr)
            : serviceText(m, tr, mine)}
      </span>
    );
  }
  if ((m as Hydrated).undecryptable && m.type === "text") {
    return (
      <span className="inline-flex items-center gap-1 italic">
        {who}
        <Lock className="size-3.5" /> {tr.chats.encryptedMessage}
      </span>
    );
  }
  if (m.bump) {
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        {who}
        {tr.messages.bumped}
        {m.replyTo?.text && <span className="truncate">· {m.replyTo.text}</span>}
      </span>
    );
  }
  if (m.type !== "text") {
    const voiceLength =
      m.type === "voice" && m.attachment?.durationMs ? ` (${formatDuration(m.attachment.durationMs)})` : "";
    return (
      <span className="inline-flex max-w-full items-center gap-1">
        {who}
        {m.sticker?.emoji}
        <MediaLabel type={shownType(m as Hydrated)} />
        {voiceLength}
        {m.type === "file" && m.attachment && !m.text && <span className="truncate">· {m.attachment.name}</span>}
        {m.type === "checklist" && m.checklist && <span className="truncate">· {m.checklist.title}</span>}
        {m.type === "poll" && m.poll && <span className="truncate">· {m.poll.question}</span>}
        {m.type === "game" && m.game && <span className="truncate">· {tr.calls[m.game.game]}</span>}
        {m.text && <span className="truncate">· {mentionAsYou(maskSpoilers(m.text, m.entities), chat, meId, tr.common.you)}</span>}
      </span>
    );
  }
  return (
    <>
      {who}
      {m.spoiler ? (
        <span className="inline-flex items-center gap-1 italic">
          <EyeOff className="size-3.5" /> {tr.summary.spoiler}
        </span>
      ) : (
        mentionAsYou(maskSpoilers(m.text ?? "", m.entities), chat, meId, tr.common.you)
      )}
    </>
  );
}

function ChatRow({ chat, meId, active, rail }: { chat: ChatDTO; meId: string; active: boolean; rail: boolean }) {
  const tr = useT();
  const goUp = useGoUp();
  const [menu, setMenu] = useState<{ at?: { x: number; y: number } } | null>(null);
  const press = useLongPress((at) => setMenu({ at }));
  const qc = useQueryClient();
  const settings = (input: Parameters<typeof updateChatSettings>[2]) =>
    void updateChatSettings(qc, chat.id, input).catch(() => null);
  const swipe = useSwipeRow(
    rail ? null : () => settings({ pinned: !chat.pinned }),
    rail ? null : () => settings({ archived: !chat.archived }),
  );
  const typing = useTyping(chat.id);
  const draft = useDrafts((s) => (active ? undefined : s.byChat[chat.id]));
  const unsent = useOutbox((s) => {
    const pending = s.byChat[chat.id];
    return pending?.find((m) => m.status === "failed") ?? pending?.find((m) => m.status === "waiting");
  });
  useEffect(() => void receiveDraft(chat), [chat.id, chat.encrypted, chat.draft?.at]);
  const peer = chatFace(chat, meId);
  const frozen = isFrozen(chat);
  const online = usePresence(chat.group || peer.id === meId || frozen ? undefined : peer.id)?.online;
  const unread = chat.unreadCount > 0;
  const loud = unread && !isMuted(chat);
  const delivery = unsent || draft ? null : lastMessageDelivery(chat, meId);
  const Tick = delivery === "sent" ? Check : CheckCheck;
  const look = active ? chatTheme(chat.theme) : null;
  const wash = look && chat.theme && chat.theme !== DEFAULT_CHAT_THEME ? look : null;
  const badge = unread && (
    <span
      className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs font-bold ${
        isMuted(chat) ? "bg-stone-300 text-stone-700 dark:bg-stone-700 dark:text-stone-200" : "bg-brand text-brand-ink"
      }`}
    >
      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
    </span>
  );

  return (
    <div {...swipe.handlers} className="group relative touch-pan-y overflow-x-clip">
      <div ref={swipe.right} className="pointer-events-none absolute inset-y-0 left-5 flex items-center opacity-0">
        <span className="grid size-10 place-items-center rounded-full bg-brand text-brand-ink">
          {chat.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
        </span>
      </div>
      <div ref={swipe.left} className="pointer-events-none absolute inset-y-0 right-5 flex items-center opacity-0">
        <span className="grid size-10 place-items-center rounded-full bg-stone-500 text-white">
          {chat.archived ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
        </span>
      </div>
      <div ref={swipe.moving}>
        <Link
          href={`/chats/${chat.id}`}
          {...press}
          title={rail ? chat.title : undefined}
          style={
            look
              ? ({
                  "--wash": `linear-gradient(135deg, ${look.light.colors.join(", ")})`,
                  "--wash-dark": `linear-gradient(135deg, ${look.dark.colors.join(", ")})`,
                  "--notch": look.light.colors[0],
                  "--notch-dark": look.dark.colors[0],
                  "--accent": look.light.bubble,
                  "--accent-dark": look.dark.bubble,
                } as React.CSSProperties)
              : undefined
          }
          className={`relative flex items-center gap-3 transition ${rail ? "justify-center py-2" : "px-4 py-3"} [-webkit-touch-callout:none] active:bg-black/5 pointer-coarse:select-none dark:active:bg-white/10 ${
            wash
              ? "bg-(image:--wash) dark:bg-(image:--wash-dark)"
              : active
                ? "bg-black/5 dark:bg-white/10"
                : loud
                  ? "bg-brand/10 hover:bg-brand/15"
                  : "hover:bg-black/[0.03] dark:hover:bg-white/5"
          }`}
        >
          {look && (
            <>
              <span className="absolute inset-y-3 left-0 hidden w-1 rounded-r-full bg-(--accent) md:block dark:bg-(--accent-dark)" />
              {!rail && (
                <svg viewBox="0 0 14 28" aria-hidden className="absolute top-1/2 right-0 hidden h-7 w-3.5 -translate-y-1/2 text-black/15 md:block dark:text-white/25">
                  <path d="M14 0 L1 14 L14 28 Z" className="fill-(--notch) dark:fill-(--notch-dark)" />
                  <path d="M14 0 L1 14 L14 28" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
              )}
            </>
          )}
          <span className="relative shrink-0">
            {chat.group ? (
              <Avatar user={peer} size={rail ? "sm" : "md"} />
            ) : (
              <StoryAvatar userId={peer.id} name={chat.title}>
                <Avatar user={peer} size={rail ? "sm" : "md"} online={online} />
              </StoryAvatar>
            )}
            {rail && badge && <span className="absolute -top-1 -right-1">{badge}</span>}
          </span>
          <div className={`min-w-0 flex-1 ${rail ? "hidden" : ""}`}>
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 truncate font-semibold">{chat.title}</p>
              {chat.supportDesk && (
                <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-brand uppercase">{tr.support.title}</span>
              )}
              <span className="flex-1" />
              {isMuted(chat) && <BellOff aria-label={tr.common.muted} className="size-3.5 shrink-0 text-stone-400" />}
              {delivery && (
                <Tick
                  aria-label={tr.messages.status[delivery]}
                  strokeWidth={2.5}
                  className={`size-4 shrink-0 ${delivery === "read" ? "text-sky-500" : "text-stone-400"}`}
                />
              )}
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
                      ? `text-stone-900 dark:text-stone-100 ${loud ? "font-semibold" : ""}`
                      : "text-stone-500 dark:text-stone-400"
                }`}
              >
                {typing ? (
                  tr.chats.typing[typing]
                ) : unsent ? (
                  <span className="inline-flex items-center gap-1">
                    {unsent.status === "failed" ? (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <AlertCircle className="size-3.5" /> {tr.messages.notSent}
                      </span>
                    ) : (
                      <>
                        <Clock className="size-3.5" /> {tr.chats.waitingForNetwork}
                      </>
                    )}
                  </span>
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
              {badge}
            </div>
          </div>
        </Link>
      </div>
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ at: { x: r.left, y: r.bottom } });
        }}
        aria-label={tr.chats.optionsFor(chat.title)}
        className={`absolute top-1/2 right-2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-stone-500 opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100 ${rail ? "" : "pointer-fine:grid"} dark:bg-stone-800/90`}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <ChatMenu
          chat={chat}
          peerName={peer.displayName}
          at={menu.at}
          onClose={() => setMenu(null)}
          onDeleted={(scope) => scope === "me" && active && goUp("/")}
        />
      )}
    </div>
  );
}

function ContactRow({ contact, active, sort }: { contact: ContactDTO; active: boolean; sort: ContactSort }) {
  const tr = useT();
  const router = useRouter();
  const presence = usePresence(contact.user.id);
  const online = presence?.online;
  const seen = presenceLabel(presence);
  const added = tr.contacts.addedOn(calendarDate(contact.addedAt));
  const details = (sort === "added" ? [added, seen] : [seen, added]).filter(Boolean).join(" · ");
  const [menu, setMenu] = useState<{ at?: { x: number; y: number } } | null>(null);
  const [editing, setEditing] = useState(false);
  const [poking, setPoking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const qc = useQueryClient();
  const press = useLongPress((at) => setMenu({ at }));
  return (
    <>
      <Link
        href={`/chats/${contact.chatId}`}
        {...press}
        className={`flex items-center gap-3 px-4 py-3 transition [-webkit-touch-callout:none] active:bg-black/5 pointer-coarse:select-none dark:active:bg-white/10 ${
          active ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/[0.03] dark:hover:bg-white/5"
        }`}
      >
        <StoryAvatar userId={contact.user.id} name={contact.user.displayName}>
          <Avatar user={contact.user} size="md" online={online} />
        </StoryAvatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{contact.user.displayName}</p>
          <p className={`truncate text-xs ${online ? "text-green-600 dark:text-green-500" : "text-stone-500"}`}>{details}</p>
        </div>
      </Link>
      {menu && (
        <Sheet
          title={contact.user.displayName}
          at={menu.at}
          onClose={() => setMenu(null)}
          actions={[
            { label: tr.contacts.openChat, onSelect: () => router.push(`/chats/${contact.chatId}`) },
            { label: tr.contacts.editContact, onSelect: () => setEditing(true) },
            { label: tr.chat.poke.action, onSelect: () => setPoking(true) },
            { label: tr.chat.removeContact(contact.user.displayName), destructive: true, onSelect: () => setRemoving(true) },
          ]}
        />
      )}
      {removing && (
        <Sheet
          title={tr.chat.removeContactConfirm(contact.user.displayName)}
          onClose={() => setRemoving(false)}
          actions={[
            {
              label: tr.chat.removeContact(contact.user.displayName),
              destructive: true,
              onSelect: () => void removeContact(qc, contact.chatId, contact.user.id).catch(() => null),
            },
          ]}
        />
      )}
      {editing && <ContactEditor userId={contact.user.id} onClose={() => setEditing(false)} />}
      {poking && <PokeDialog peerId={contact.user.id} peerName={contact.user.displayName} onClose={() => setPoking(false)} />}
    </>
  );
}

const SORT_KEY = "six:contact-sort";

const contactsQuery = {
  queryKey: ["contacts"],
  staleTime: 0,
  queryFn: async () => unwrap(await six.api.GET("/v1/contacts", { params: { query: { limit: 200 } } })).items,
};

/**
 * Everyone I share a direct chat with, A to Z, by last active or by newest, even the chats I deleted for me, and
 * opens our chat.
 */
function ContactRows({ needle, query }: { needle: string; query: string }) {
  const tr = useT();
  const pathname = usePathname();
  const [sort, setSort] = useState<ContactSort>("active");
  const presence = usePresenceStore((s) => s.byUser);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY) as ContactSort | null;
      if (saved && CONTACT_SORTS.includes(saved)) setSort(saved);
    } catch {}
  }, []);
  function pickSort(next: ContactSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {}
  }
  const contacts = useQuery(contactsQuery);
  const hidden = useHiddenByArchive().chatIds;
  const matching = contacts.data?.filter((c) => !hidden.has(c.chatId) && c.user.displayName.toLowerCase().includes(needle)) ?? [];
  useWatchPresence(matching.map((c) => c.user.id));
  const shown = sortContacts(matching, sort, (id) => presence[id]);

  return (
    <>
      {shown.length > 1 && (
        <div role="radiogroup" aria-label={tr.contacts.sortBy} className="flex gap-1.5 overflow-x-auto px-4 pt-2">
          {CONTACT_SORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sort === s}
              onClick={() => pickSort(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
                sort === s
                  ? "bg-brand text-brand-ink"
                  : "bg-black/5 text-stone-600 hover:bg-black/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15"
              }`}
            >
              {tr.contacts.sorts[s]}
            </button>
          ))}
        </div>
      )}
      {contacts.isPending ? (
        <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>
      ) : contacts.isError ? (
        <p className="p-4 text-sm text-red-600">{tr.common.somethingWrong}</p>
      ) : !shown.length ? (
        <p className="p-8 text-center text-sm text-stone-500">{needle ? tr.contacts.noMatch(query) : tr.contacts.none}</p>
      ) : (
        shown.map((c) => <ContactRow key={c.user.id} contact={c} sort={sort} active={pathname === `/chats/${c.chatId}`} />)
      )}
    </>
  );
}

type ListView = "chats" | "desk" | "contacts";

/**
 * The chat list, or with `archived` the archived chats behind the app lock code, or with `contacts` my contacts.
 * Whoever answers support gets a switch at the bottom for the support chats. Pulling the list down past
 * its top shows the archived row, and pulling again hides it.
 */
export function ChatList({
  archived = false,
  rail = false,
  contacts = false,
}: {
  archived?: boolean;
  rail?: boolean;
  contacts?: boolean;
}) {
  const tr = useT();
  const router = useRouter();
  const goUp = useGoUp();
  const openSupport = async () => {
    try {
      router.push(`/chats/${unwrap(await six.api.POST("/v1/support")).id}`);
    } catch (err) {
      alert((err as Error).message);
    }
  };
  const meId = useSession((s) => s.user!.id);
  const isSupport = useSession((s) => s.user!.support);
  const hasAppLock = useSession((s) => s.user!.hasAppLock);
  const archiveOpen = useAppLock((s) => s.archiveOpen);
  const chats = useChats(archived);
  const qc = useQueryClient();
  useEffect(() => {
    if (!archived && chats.data) ensureBotChat(qc, chats.data);
  }, [archived, chats.data, qc]);
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
  const [dialog, setDialog] = useState<"add" | "invite" | "findMe" | "group" | null>(null);
  const lonely = useQuery({ ...contactsQuery, enabled: !archived && !rail }).data?.length === 0;
  useEffect(() => {
    if (lonely) void qc.invalidateQueries({ queryKey: ["contacts"] });
  }, [chats.data?.length]);
  const needle = rail ? "" : query.trim().toLowerCase();
  const [picked, setPicked] = useState<ChatFilter>("all");
  const [viewPicked, setView] = useState<ListView>("chats");
  const filtering = !archived && !rail;
  const hasDesk = filtering && !!chats.data?.some((c) => c.supportDesk);
  const views: ListView[] = hasDesk ? ["chats", "desk"] : ["chats"];
  const view = contacts ? "contacts" : filtering && views.includes(viewPicked) ? viewPicked : "chats";
  const desk = view === "desk";
  const unreadIn = (d: boolean) => chats.data?.filter((c) => c.supportDesk === d && c.unreadCount > 0).length ?? 0;
  const visible =
    chats.data?.filter((c) => c.lastMessage && (!hasDesk || c.supportDesk === desk) && c.title.toLowerCase().includes(needle)) ?? [];
  const filter = filtering ? picked : "all";
  const shown = visible.filter((c) => inChatFilter(c, filter));
  const archivedCount = archivedChats.data?.length ?? 0;
  const archivedUnread = archivedChats.data?.reduce((n, c) => n + c.unreadCount, 0) ?? 0;
  const [pulledOn, setPulledOn] = useState<string | null>(null);
  const pullFrom = useRef<number | null>(null);
  const lastPull = useRef(0);
  const showArchive = filtering && view === "chats" && !needle && archivedCount > 0 && pulledOn === pathname;
  const togglePull = () => {
    const fresh = Date.now() - lastPull.current > 800;
    lastPull.current = Date.now();
    if (fresh) setPulledOn((p) => (p === pathname ? null : pathname));
  };
  useWatchPresence(visible.filter((c) => !c.group).flatMap((c) => c.members.map((m) => m.user.id)).filter((id) => id !== meId));

  useEffect(() => {
    if (pathname === "/") setArchiveOpen(false);
  }, [pathname]);


  if (archived && hasAppLock && !archiveOpen) {
    return (
      <LockScreen title={tr.common.archived} onUnlock={() => setArchiveOpen(true)} onCancel={() => goUp("/")} />
    );
  }

  const top = !rail && (
    <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
      {filtering && view === "chats" && !needle && (
        <Suspense>
          <StoriesBar />
        </Suspense>
      )}
      <label
        className="flex w-full items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-brand dark:bg-white/10"
      >
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.contacts.search}
          aria-label={tr.contacts.search}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-stone-900 outline-none placeholder:text-stone-500 md:text-sm dark:text-stone-100"
        />
      </label>
      {filtering && view !== "contacts" && (
        <div role="tablist" className="flex w-full gap-1.5 overflow-x-auto">
          {CHAT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setPicked(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
                filter === f
                  ? "bg-brand text-brand-ink"
                  : "bg-black/5 text-stone-600 hover:bg-black/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15"
              }`}
            >
              {tr.chats.filters[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {archived ? (
        <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
          <BackLink
            href="/"
            aria-label={tr.common.backToChats}
            className="-ml-2 grid size-9 place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            <ChevronLeft className="size-6" />
          </BackLink>
          <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">{tr.common.archived}</h1>
        </header>
      ) : (
        !rail && (
          <BrandActions>
            {statusText && <span className="mr-1 text-xs text-stone-500">{statusText}</span>}
            {!isSupport && (
              <button
                onClick={() => void openSupport()}
                aria-label={tr.support.contact}
                title={tr.support.contact}
                className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
              >
                <Headset className="size-5" />
              </button>
            )}
            {view === "contacts" && (
              <button
                onClick={() => setDialog("findMe")}
                aria-label={tr.settings.findMe}
                title={tr.settings.findMe}
                className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
              >
                <QrCode className="size-5" />
              </button>
            )}
            {view !== "contacts" && (
              <button
                onClick={() => setDialog("group")}
                aria-label={tr.groups.newGroup}
                title={tr.groups.newGroup}
                className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
              >
                <Users className="size-5" />
              </button>
            )}
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
            {hasAppLock && (
              <button
                onClick={() => useAppLock.setState({ locked: true, archiveOpen: false })}
                aria-label={tr.settings.appLock.lockNow}
                title={tr.settings.appLock.lockNow}
                className="grid size-9 place-items-center rounded-full text-brand hover:bg-stone-200 dark:hover:bg-stone-800"
              >
                <Lock className="size-5" />
              </button>
            )}
          </BrandActions>
        )
      )}
      {dialog === "add" && <AddContact onClose={() => setDialog(null)} />}
      {dialog === "group" && <NewGroupDialog onClose={() => setDialog(null)} />}
      {dialog === "invite" && <NewInviteDialog onClose={() => setDialog(null)} />}
      {dialog === "findMe" && (
        <Dialog onClose={() => setDialog(null)}>
          <div className="p-4">
            <FindMe />
          </div>
        </Dialog>
      )}
      {!archived && !rail && <BackupPinBanner />}
      {!archived && !rail && (
        <div className="mx-3 mt-3 empty:hidden">
          <InstallCard dismissible />
        </div>
      )}
      {!archived && !rail && (
        <div className="mx-3 mt-3 empty:hidden">
          {lonely ? <InviteNudge onInvite={() => setDialog("invite")} /> : <TipCard />}
        </div>
      )}

      {top}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onTouchStart={(e) => {
          pullFrom.current = e.currentTarget.scrollTop <= 0 ? e.touches[0]!.clientY : null;
        }}
        onTouchMove={(e) => {
          if (pullFrom.current === null || e.touches[0]!.clientY - pullFrom.current <= 60) return;
          pullFrom.current = null;
          togglePull();
        }}
        onWheel={(e) => {
          if (e.deltaY < -30 && e.currentTarget.scrollTop <= 0) togglePull();
        }}
      >
        {view === "contacts" ? (
          <ContactRows needle={needle} query={query.trim()} />
        ) : (
          <div>
            {showArchive && (
              <Link
                href="/archived"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-stone-600 hover:bg-black/[0.03] dark:text-stone-300 dark:hover:bg-white/5"
              >
                <span className="grid size-14 place-items-center rounded-full bg-stone-200/70 text-stone-500 dark:bg-stone-800">
                  <Archive className="size-5" />
                </span>
                <span className="flex-1">{tr.common.archived}</span>
                {archivedUnread > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">
                    {archivedUnread > 99 ? "99+" : archivedUnread}
                  </span>
                )}
              </Link>
            )}
            {chats.isPending && <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>}
            {chats.isError && <p className="p-4 text-sm text-red-600">{tr.chats.couldNotLoad}</p>}
            {chats.isSuccess && needle && visible.length === 0 && (
              <p className="p-8 text-center text-sm text-stone-500">{tr.contacts.noMatch(query.trim())}</p>
            )}
            {chats.isSuccess && !rail && !needle && visible.length === 0 && (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-stone-200/70 text-stone-400 dark:bg-stone-800">
                  {archived ? (
                    <Archive className="size-8" strokeWidth={1.6} />
                  ) : desk ? (
                    <Headset className="size-8" strokeWidth={1.6} />
                  ) : (
                    <MessageCircle className="size-8" strokeWidth={1.6} />
                  )}
                </span>
                <p className="font-medium">{archived ? tr.chats.noArchived : tr.chats.noChats}</p>
                {!archived && !desk && (
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
            {chats.isSuccess && visible.length > 0 && shown.length === 0 && (
              <p className="p-8 text-center text-sm text-stone-500">{tr.chats.filterEmpty}</p>
            )}
            {shown.map((c) => (
              <ChatRow key={c.id} chat={c} meId={meId} active={pathname === `/chats/${c.id}`} rail={rail} />
            ))}
          </div>
        )}
      </div>
      {!rail && <AdBanner />}
      {filtering && view !== "contacts" && views.length > 1 && (
        <div role="tablist" className="mx-3 my-2 flex rounded-full bg-stone-200/70 p-1 dark:bg-stone-800">
          {views.map((v) => {
            const unread = unreadIn(v === "desk");
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold transition ${
                  view === v ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                }`}
              >
                {v === "desk" ? tr.support.title : tr.common.chats}
                {unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
