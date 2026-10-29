"use client";

import { type MessageDTO, QUICK_REACTIONS } from "@six/shared";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Emojis } from "./emoji-picker";
import { Portal } from "./portal";
import { Card, SectionTitle } from "./ui";

export const isMine = (m: MessageDTO, meId: string, emoji: string) =>
  !!m.reactions?.some((r) => r.emoji === emoji && r.userIds.includes(meId));

/** Your own quick reactions, or the app's when you haven't picked any. */
export function useQuickReactions(): readonly string[] {
  const own = useSession((s) => s.user?.quickReactions);
  return own?.length === QUICK_REACTIONS.length ? own : QUICK_REACTIONS;
}

export function ReactionBar({
  message,
  meId,
  onReact,
  onMore,
}: {
  message: MessageDTO;
  meId: string;
  onReact: (emoji: string) => void;
  onMore: () => void;
}) {
  const tr = useT();
  const quick = useQuickReactions();
  return (
    <div className="flex items-center justify-between gap-1" role="group" aria-label={tr.messages.react}>
      {quick.map((emoji) => {
        const mine = isMine(message, meId, emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            aria-label={mine ? tr.messages.removeReaction(emoji) : tr.messages.reactWith(emoji)}
            aria-pressed={mine}
            className={`grid size-10 place-items-center rounded-full text-2xl transition hover:scale-110 hover:bg-stone-100 dark:hover:bg-stone-800 ${
              mine ? "bg-brand/20" : ""
            }`}
          >
            {emoji}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-label={tr.messages.moreReactions}
        className="grid size-10 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/** Closes a floating panel on a click outside it (dialogs excepted), Escape, resize or scrolling the page. */
function useDismiss(root: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[role=dialog]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) =>
      !root.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[role=dialog]") && onClose();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [root, onClose]);
}

/** Puts a w×h panel next to `anchor` on the preferred side, flipping and clamping to stay on screen. */
function placeNear(anchor: DOMRect, w: number, h: number, alignEnd: boolean, prefer: "above" | "below") {
  const width = Math.min(w, window.innerWidth - 16);
  const left = Math.min(Math.max(8, alignEnd ? anchor.right - width : anchor.left), window.innerWidth - width - 8);
  const above = anchor.top - h - 8;
  const below = anchor.bottom + 8;
  const fitsAbove = above >= 8;
  const fitsBelow = below + h <= window.innerHeight - 8;
  const top =
    prefer === "above"
      ? fitsAbove
        ? above
        : Math.min(below, window.innerHeight - h - 8)
      : fitsBelow || !fitsAbove
        ? Math.max(8, Math.min(below, window.innerHeight - h - 8))
        : above;
  return { top, left, width };
}

const BAR_WIDTH = 7 * 44 + 12;
const BAR_HEIGHT = 52;

/** The quick reaction bar, floating just above (or below, near the top) the message it belongs to. */
export function ReactionPopover({
  anchor,
  alignEnd,
  message,
  meId,
  onReact,
  onMore,
  onClose,
}: {
  anchor: DOMRect;
  alignEnd: boolean;
  message: MessageDTO;
  meId: string;
  onReact: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { top, left, width } = placeNear(anchor, BAR_WIDTH, BAR_HEIGHT, alignEnd, "above");

  useDismiss(root, onClose);

  return (
    <Portal>
      <div
        ref={root}
        data-dismissable
        style={{ top, left, width }}
        className="reaction-pop fixed z-[60] rounded-full bg-white px-1.5 py-1 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
      >
        <ReactionBar message={message} meId={meId} onReact={onReact} onMore={onMore} />
      </div>
    </Portal>
  );
}

export function ReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const tr = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal aria-label={tr.messages.pickReaction}>
        <button aria-label={tr.common.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="relative flex h-[420px] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl md:rounded-3xl dark:bg-stone-900">
          <div className="flex items-center px-4 pt-3">
            <h2 className="flex-1 font-semibold">{tr.messages.react}</h2>
            <button
              onClick={onClose}
              aria-label={tr.common.close}
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
          </div>
          <Emojis
            onPick={(emoji) => {
              onPick(emoji);
              onClose();
            }}
          />
        </div>
      </div>
    </Portal>
  );
}

const VISIBLE_CHIPS = 3;
const LIST_WIDTH = 260;
const LIST_ROW = 44;

type Reaction = MessageDTO["reactions"][number];

function Chip({ r, own, label, onClick }: { r: Reaction; own: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={own}
      className={`flex h-6 items-center gap-1 rounded-full px-1.5 text-sm leading-none shadow-sm ring-1 transition active:scale-95 ${
        own ? "bg-brand/15 ring-brand/60 dark:bg-brand/25" : "bg-white ring-stone-200 dark:bg-stone-800 dark:ring-stone-700"
      }`}
    >
      <span>{r.emoji}</span>
      {r.userIds.length > 1 && (
        <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{r.userIds.length}</span>
      )}
    </button>
  );
}

export function ReactionChips({
  message,
  meId,
  mine,
  nameOf,
  onReact,
}: {
  message: MessageDTO;
  meId: string;
  mine: boolean;
  nameOf: (userId: string) => string;
  onReact: (emoji: string) => void;
}) {
  const tr = useT();
  const [listAt, setListAt] = useState<DOMRect | null>(null);
  const closeList = useCallback(() => setListAt(null), []);
  if (!message.reactions?.length) return null;

  const names = (r: Reaction) => r.userIds.map((id) => (id === meId ? tr.common.you : nameOf(id))).join(", ");
  const ranked = [...message.reactions].sort((a, b) => b.userIds.length - a.userIds.length);
  const shown = ranked.length > VISIBLE_CHIPS + 1 ? ranked.slice(0, VISIBLE_CHIPS) : ranked;
  const hidden = ranked.length - shown.length;

  return (
    <div className={`relative z-10 -mt-2.5 flex flex-wrap gap-1 self-stretch px-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {shown.map((r) => {
        const own = r.userIds.includes(meId);
        return (
          <Chip
            key={r.emoji}
            r={r}
            own={own}
            label={`${r.emoji} ${names(r)}${own ? ` ${tr.messages.tapToRemoveYours}` : ""}`}
            onClick={() => onReact(r.emoji)}
          />
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={(e) => setListAt(e.currentTarget.getBoundingClientRect())}
          aria-label={tr.messages.nMoreReactions(hidden)}
          aria-expanded={!!listAt}
          className="flex h-6 items-center rounded-full bg-white px-2 text-xs font-semibold text-stone-600 shadow-sm ring-1 ring-stone-200 transition active:scale-95 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700"
        >
          +{hidden}
        </button>
      )}
      {listAt && hidden > 0 && (
        <ReactionList
          anchor={listAt}
          alignEnd={mine}
          reactions={ranked.slice(shown.length)}
          meId={meId}
          names={names}
          onReact={onReact}
          onClose={closeList}
        />
      )}
    </div>
  );
}

function ReactionList({
  anchor,
  alignEnd,
  reactions,
  meId,
  names,
  onReact,
  onClose,
}: {
  anchor: DOMRect;
  alignEnd: boolean;
  reactions: Reaction[];
  meId: string;
  names: (r: Reaction) => string;
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, onClose);
  const height = Math.min(reactions.length * LIST_ROW + 16, 320);
  const { top, left, width } = placeNear(anchor, LIST_WIDTH, height, alignEnd, "below");

  return (
    <Portal>
      <div
        ref={root}
        role="menu"
        aria-label={tr.messages.allReactions}
        style={{ top, left, width, maxHeight: height }}
        className="reaction-pop fixed z-[60] overflow-y-auto overscroll-contain rounded-2xl bg-white p-2 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
      >
        {reactions.map((r) => {
          const own = r.userIds.includes(meId);
          return (
            <button
              key={r.emoji}
              type="button"
              role="menuitemcheckbox"
              aria-checked={own}
              onClick={() => onReact(r.emoji)}
              className={`flex h-10 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${
                own ? "bg-brand/10" : ""
              }`}
            >
              <span className="text-xl">{r.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{names(r)}</span>
              {r.userIds.length > 1 && <span className="text-xs font-medium text-stone-500">{r.userIds.length}</span>}
            </button>
          );
        })}
      </div>
    </Portal>
  );
}

/** Settings card for your six quick reactions: tap one to swap it for any emoji. */
export function QuickReactionsSettings() {
  const tr = useT();
  const quick = useQuickReactions();
  const setUser = useSession((s) => s.setUser);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: readonly string[]) {
    setSaving(true);
    const res = await six.api.PATCH("/v1/me", { body: { quickReactions: [...next] } }).catch(() => null);
    if (res?.data) setUser(res.data);
    setSaving(false);
  }

  function pick(index: number, emoji: string) {
    const next = [...quick];
    const was = next.indexOf(emoji);
    if (was >= 0) next[was] = next[index]!;
    next[index] = emoji;
    void save(next);
  }

  const custom = quick.join() !== QUICK_REACTIONS.join();
  return (
    <section className="space-y-3">
      <SectionTitle
        action={
          custom && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(QUICK_REACTIONS)}
              className="text-sm font-medium text-brand disabled:opacity-50"
            >
              {tr.messages.resetQuickReactions}
            </button>
          )
        }
      >
        {tr.messages.quickReactions}
      </SectionTitle>
      <Card>
        <div className="space-y-3 p-4">
          <p className="text-sm text-stone-500 dark:text-stone-400">{tr.messages.quickReactionsHint}</p>
          <div className="flex justify-between gap-1">
            {quick.map((emoji, i) => (
              <button
                key={emoji}
                type="button"
                disabled={saving}
                onClick={() => setEditing(i)}
                aria-label={tr.messages.changeQuickReaction(emoji)}
                className="grid size-12 place-items-center rounded-full bg-stone-100 text-2xl transition hover:scale-105 disabled:opacity-50 dark:bg-stone-800"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </Card>
      {editing !== null && (
        <ReactionPicker onPick={(emoji) => pick(editing, emoji)} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
