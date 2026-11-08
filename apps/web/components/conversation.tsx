"use client";

import { type MessageDTO, chatFace, durationLabel, isFrozen, isMuted, previewText, readOnlyGroup } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ChevronLeft, ChevronsUpDown, Images, Lock, MoreVertical, Phone, PinOff, Search, ShieldAlert, Trash2, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { closeChat, deleteMessages, updateChatSettings } from "@/lib/actions";
import { setArchiveOpen } from "@/lib/app-lock";
import { useChatShut } from "@/lib/archive-lock";
import { startCall, useCall } from "@/lib/call";
import { looking } from "@/lib/notify";
import { e2ee, useIdentityChanges } from "@/lib/e2ee";
import { isBotChat, useChat, useMessages } from "@/lib/chats";
import { setActiveChat, useRealtime } from "@/lib/realtime";
import { MAX_SELECTED, useSelection } from "@/lib/selection";
import { presenceLabel, usePresence, useWatchPresence } from "@/lib/presence";
import { sendAtLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useTyping } from "@/lib/typing";
import { AdBanner } from "./ad-banner";
import { LockScreen } from "./app-lock";
import { Avatar } from "./avatar";
import { BubbleColors, ChatBackground } from "./chat-background";
import { ChatBlocked } from "./chat-blocked";
import { ChatMenu } from "./chat-menu";
import { BotGames } from "./bot-games";
import { Composer } from "./composer";
import { ContactEditor } from "./contact-editor";
import { GroupInfo } from "./groups";
import { MessageList, type MessageListHandle } from "./message-list";
import { SharedMedia, type SharedTab } from "./shared-media";
import { Sheet } from "./sheet";

const headerClass =
  "flex items-center gap-1 border-b border-black/5 bg-stone-50/45 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:pt-2 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40";
const iconButton =
  "grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800";

function useHeight() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, height] as const;
}

/**
 * Escape goes back to the chat list, unless something else takes it: the composer (reply, edit, suggestions),
 * a text field, or an open dialog, menu or popover. It listens on the document, which hears the key before
 * the window-level handlers close those overlays.
 */
function useEscapeBack(href: string, skip: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (skip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.defaultPrevented || e.target instanceof HTMLInputElement) return;
      if (document.querySelector("[role=dialog], [role=menu], [data-dismissable]")) return;
      router.push(href);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [href, skip, router]);
}

/** A chat, or the app lock code first when it's archived and the archive is shut, however it was opened. */
export function Conversation({ chatId }: { chatId: string }) {
  const tr = useT();
  const router = useRouter();
  const chat = useChat(useQueryClient(), chatId);
  if (useChatShut(chatId, chat.data)) {
    return <LockScreen title={tr.common.archived} onUnlock={() => setArchiveOpen(true)} onCancel={() => router.push("/")} />;
  }
  return <OpenConversation chatId={chatId} />;
}

function OpenConversation({ chatId }: { chatId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const meId = useSession((s) => s.user!.id);
  const chat = useChat(qc, chatId);
  const messages = useMessages(chatId);
  const { realtime, status } = useRealtime();
  const list = useRef<MessageListHandle>(null);
  const [menu, setMenu] = useState(false);
  const [muting, setMuting] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("info")) return;
    setEditing(true);
    router.replace(`/chats/${chatId}`);
  }, [chatId, router]);
  const [shared, setShared] = useState<SharedTab | null>(null);
  const [searchFor, setSearchFor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const [head, headHeight] = useHeight();
  const [foot, footHeight] = useHeight();
  const typing = useTyping(chatId);
  const selecting = useSelection((s) => s.chatId === chatId);
  const selectedIds = useSelection((s) => s.ids);
  const clearSelection = useSelection((s) => s.clear);

  const encryptedFor = chat.data?.encrypted ? chat.data.members.map((m) => m.user.id).join(",") : null;
  useEffect(() => {
    if (encryptedFor) void e2ee()?.warmDevices(encryptedFor.split(",")).catch(() => null);
  }, [encryptedFor]);

  useEffect(() => {
    setActiveChat(chatId);
    closeChat(chatId);
    return () => {
      setActiveChat(null);
      closeChat(chatId);
      useSelection.getState().clear();
    };
  }, [chatId]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clearSelection();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, clearSelection]);
  useEscapeBack(chat.data?.archived ? "/archived" : "/", selecting);

  const unread = chat.data?.unreadCount ?? 0;
  const onSeen = useCallback(() => {
    if (unread > 0 && realtime && looking()) {
      void realtime.markRead(chatId).catch(() => null);
    }
  }, [unread, realtime, chatId]);

  useEffect(() => {
    document.addEventListener("visibilitychange", onSeen);
    window.addEventListener("focus", onSeen);
    return () => {
      document.removeEventListener("visibilitychange", onSeen);
      window.removeEventListener("focus", onSeen);
    };
  }, [onSeen]);

  const members = chat.data?.members;
  const nameOf = useMemo(() => {
    const names = new Map(members?.map((m) => [m.user.id, m.user.displayName]));
    const gone = chat.data?.group ? tr.groups.formerMember : tr.common.someone;
    return (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? gone));
  }, [members, meId, tr, chat.data?.group]);
  const peerId = chat.data?.group ? undefined : members?.find((m) => m.user.id !== meId)?.user.id;
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
  const peer = chatFace(c, meId);
  const muted = isMuted(c);
  const frozen = isFrozen(c);
  const app = c.withSupport;
  const shownPresence = frozen || c.withSupport || c.group ? undefined : presence;
  const count = selecting ? selectedIds.length : 0;
  const pins = c.pinnedMessages;
  const pin = pins[pinIndex % (pins.length || 1)];

  const selectable = () =>
    (messages.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.type !== "service").map((m) => m.id);

  function chooseMessages() {
    const newest = selectable()[0];
    if (newest) useSelection.getState().start(chatId, newest);
  }

  function selectBetween() {
    const ids = selectable();
    const at = selectedIds.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
    if (at.length) useSelection.setState({ ids: ids.slice(Math.min(...at), Math.max(...at) + 1) });
  }

  function removeSelected(scope: "me" | "all") {
    const byId = new Map<string, MessageDTO>(
      (messages.data?.pages.flatMap((p) => p.items) ?? []).map((m) => [m.id, m]),
    );
    const chosen = selectedIds.map((id) => byId.get(id)).filter((m): m is MessageDTO => !!m);
    clearSelection();
    void deleteMessages(qc, chatId, chosen, scope).catch(() => null);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChatBackground themeId={c.theme} />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={head} className="absolute inset-x-0 top-0 z-10">
            {selecting ? (
              <header className={headerClass}>
                <button onClick={clearSelection} aria-label={tr.chat.cancelSelection} className={iconButton}>
                  <X className="size-5" />
                </button>
                <p className="min-w-0 flex-1 font-semibold">{tr.chat.selected(count)}
                  {count >= MAX_SELECTED && " · max"}
                </p>
                {count >= 2 && (
                  <button onClick={selectBetween} aria-label={tr.chat.selectBetween} title={tr.chat.selectBetween} className={iconButton}>
                    <ChevronsUpDown className="size-5" />
                  </button>
                )}
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
                  onClick={() => !app && setEditing(true)}
                  className={`flex min-w-0 flex-1 items-center gap-2 py-0.5 pr-2 text-left ${app ? "cursor-default" : "cursor-pointer"}`}
                  aria-label={app || c.group ? c.title : tr.chat.editContact(c.title)}
                >
                  <Avatar user={peer} online={shownPresence?.online} />
                  <span className="min-w-0 flex-1 max-sm:hidden">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="truncate">{c.title}</span>
                      {c.supportDesk && (
                        <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-brand uppercase">{tr.support.title}</span>
                      )}
                      {c.encrypted && <Lock className="size-3.5 shrink-0 text-stone-400" aria-label={tr.chat.encrypted} />}
                    </span>
                    {status === "offline" || status === "connecting" ? (
                      <span className="block text-xs text-stone-500">
                        {status === "offline" ? tr.chats.waitingForNetwork : tr.common.connecting}
                      </span>
                    ) : typing ? (
                      <span className="block text-xs font-medium text-brand">{tr.chats.typing[typing]}</span>
                    ) : (
                      (shownPresence || muted || c.archived || c.autoDeleteSecs || c.support || c.withSupport || c.group) && (
                        <span className="line-clamp-2 text-xs text-stone-500">
                          {shownPresence?.online && <span className="font-medium text-brand">{tr.time.online}</span>}
                          {shownPresence?.online && (muted || c.archived || c.autoDeleteSecs || c.support) && " · "}
                          {[
                            c.group && tr.groups.members(c.members.length),
                            c.support && tr.support.title,
                            c.withSupport && tr.support.team,
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
                {!isBotChat(c) && (
                  <>
                    <button
                      onClick={() => {
                        setSearchFor("");
                        setShared("search");
                      }}
                      aria-label={tr.chat.search}
                      title={tr.chat.search}
                      className={iconButton}
                    >
                      <Search className="size-5" />
                    </button>
                    <button
                      onClick={() => {
                        setSearchFor("");
                        setShared("media");
                      }}
                      aria-label={tr.chat.sharedMedia}
                      title={tr.chat.sharedMedia}
                      className={iconButton}
                    >
                      <Images className="size-5" />
                    </button>
                    <button
                      onClick={() => (muted ? void updateChatSettings(qc, chatId, { muted: false }).catch(() => null) : setMuting(true))}
                      aria-label={muted ? tr.common.unmute : tr.common.mute}
                      title={muted ? tr.common.unmute : tr.common.mute}
                      className={iconButton}
                    >
                      {muted ? <BellOff className="size-5" /> : <Bell className="size-5" />}
                    </button>
                  </>
                )}
                {!frozen && !c.group && !c.support && !c.withSupport && !isBotChat(c) && (
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
            {!selecting && pin && (
              <div className="flex items-center gap-1 border-b border-black/5 bg-stone-50/45 py-1 pr-2 pl-4 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40">
                <button
                  onClick={() => {
                    list.current?.jumpTo(pin.id);
                    setPinIndex((pins.indexOf(pin) + 1) % pins.length);
                  }}
                  className="min-w-0 flex-1 border-l-2 border-brand py-0.5 pl-2 text-left"
                >
                  <span className="block text-xs font-semibold text-brand">
                    {pins.length > 1 ? tr.messages.pinnedOf(pins.indexOf(pin) + 1, pins.length) : tr.messages.pinnedMessage}
                  </span>
                  <span className="block truncate text-sm text-stone-600 dark:text-stone-300">
                    {previewText(pin, tr)}
                  </span>
                </button>
                {!frozen && (
                  <button
                    onClick={() => void updateChatSettings(qc, chatId, { unpin: pin.id }).catch(() => null)}
                    aria-label={tr.messages.unpin}
                    title={tr.messages.unpin}
                    className={iconButton}
                  >
                    <PinOff className="size-4" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <BubbleColors themeId={c.theme} scope="chat-colors" />
            <div className="chat-colors relative flex min-h-0 flex-1 flex-col">
              <MessageList
                ref={list}
                chat={c}
                meId={meId}
                onSeen={onSeen}
                insetTop={headHeight}
                insetBottom={footHeight}
              />
            </div>
          </div>
          <div ref={foot} className="absolute inset-x-0 bottom-0 z-20">
            {!selecting && <AdBanner />}
            {!selecting && keysChanged && !c.withSupport && (
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
            {!selecting && c.supportClosedAt && (
              <p className="border-t border-black/5 bg-stone-50/45 px-4 py-2 text-center text-sm text-stone-500 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/40 dark:text-stone-400">
                {c.supportDesk ? tr.support.closedDesk : tr.support.closed}
              </p>
            )}
            {!selecting && (frozen || readOnlyGroup(c)) && <ChatBlocked chat={c} peerId={peer.id} peerName={peer.displayName} />}
            {!selecting && !frozen && isBotChat(c) && <BotGames />}
            {!selecting && !frozen && !readOnlyGroup(c) && !isBotChat(c) && (
              <div className="chat-colors contents">
                <Composer
                  chatId={chatId}
                  nameOf={nameOf}
                  scheduledCount={c.scheduledCount}
                  limited={c.support || c.withSupport}
                  onSent={() => requestAnimationFrame(() => list.current?.scrollToBottom())}
                  onSearch={(q) => {
                    setSearchFor(q);
                    setShared("search");
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <ChatMenu
          chat={c}
          peerName={peer.displayName}
          muteIcon={!isBotChat(c)}
          onClose={() => setMenu(false)}
          onGroupInfo={() => setEditing(true)}
          onDeleted={(scope) => scope === "me" && router.replace("/")}
          onChooseMessages={chooseMessages}
        />
      )}
      {muting && <ChatMenu chat={c} peerName={peer.displayName} start="mute" onClose={() => setMuting(false)} />}
      {shared && (
        <SharedMedia
          chat={c}
          initial={shared}
          query={searchFor}
          onJump={(id) => {
            setShared(null);
            list.current?.jumpTo(id);
          }}
          onClose={() => setShared(null)}
        />
      )}
      {editing &&
        (c.group ? (
          <GroupInfo chat={c} onClose={() => setEditing(false)} />
        ) : (
          <ContactEditor userId={peer.id} onClose={() => setEditing(false)} />
        ))}
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
