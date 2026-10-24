"use client";

import { unwrap } from "@six/sdk";
import {
  type ChatDTO,
  EPHEMERAL_RESEND,
  type EphemeralDTO,
  type MessageDTO,
  type MessageEntity,
  type ReplyPreview,
  type StickerDTO,
  type ViewMessageResult,
  serviceSentence,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  CheckCheck,
  CheckCircle2,
  Circle,
  CircleUserRound,
  Clock,
  EyeOff,
  Film,
  Flame,
  Image as ImageIcon,
  Mic,
  MoreHorizontal,
  SmilePlus,
  Paperclip,
  RotateCcw,
  Sticker as StickerIcon,
  Palette,
  Timer,
  Video,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VList, type VListHandle } from "virtua";
import { applyEdited, deleteMessage, markOpenedLocally, react } from "@/lib/actions";
import { shortRule } from "@/lib/ephemeral";
import { six } from "@/lib/six";
import { useMessages } from "@/lib/chats";
import { useComposerMode } from "@/lib/composer";
import { clockTime, dayLabel, sameDay } from "@/lib/format";
import { emojiOnly } from "@/lib/emoji";
import { useLongPress } from "@/lib/long-press";
import { segments } from "@/lib/markup";
import { type PendingMessage, useOutbox, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { deliver } from "@/lib/send";
import { useSelection } from "@/lib/selection";
import { useSpoilers } from "@/lib/spoilers";
import { AnimatedEmoji } from "./animated-emoji";
import { AttachmentView, Lightbox, type LightboxItem, type ShownAttachment } from "./attachment";
import { PackDialog } from "./pack-dialog";
import { ReportDialog } from "./report-dialog";
import { Styled } from "./rich-text";
import { ReactionChips, ReactionPicker, ReactionPopover } from "./reactions";
import { Sheet, type SheetAction } from "./sheet";
import { StickerView } from "./sticker";

type Delivery = "sending" | "failed" | "sent" | "delivered" | "read";

interface MsgRow {
  kind: "msg";
  key: string;
  id: string | null;
  message: MessageDTO | null;
  pending: PendingMessage | null;
  text: string | null;
  entities: MessageEntity[];
  spoiler: boolean;
  replyTo: ReplyPreview | null;
  createdAt: string;
  mine: boolean;
  deleted: boolean;
  edited: boolean;
  attachment: ShownAttachment | null;
  sticker: StickerDTO | null;
  type: MessageDTO["type"];
  ephemeral: EphemeralDTO | null;
  reveal: { expiresAt: string | null } | null;
  groupStart: boolean;
  groupEnd: boolean;
  delivery: Delivery | null;
}

type Row = { kind: "day"; key: string; label: string } | { kind: "service"; key: string; message: MessageDTO } | MsgRow;

interface Item {
  senderId: string;
  createdAt: string;
  row: Omit<MsgRow, "kind" | "groupStart" | "groupEnd" | "delivery">;
}

function buildRows(
  messages: MessageDTO[],
  pending: PendingMessage[],
  meId: string,
  peerDeliveredAt: number,
  peerReadAt: number,
): Row[] {
  const sent = new Set(messages.filter((m) => m.senderId === meId).map((m) => m.clientId));
  const items: Item[] = [
    ...messages.map((m) => ({
      senderId: m.senderId,
      createdAt: m.createdAt,
      row: {
        key: `${m.senderId}:${m.clientId}`,
        id: m.id,
        message: m,
        pending: null,
        text: m.text,
        entities: m.entities,
        spoiler: m.spoiler,
        replyTo: m.replyTo,
        createdAt: m.createdAt,
        mine: m.senderId === meId,
        deleted: m.deletedAt !== null,
        edited: m.editedAt !== null,
        attachment: m.attachment ? { source: "server" as const, data: m.attachment } : null,
        sticker: m.sticker,
        type: m.type,
        ephemeral: m.ephemeral,
        reveal: null,
      },
    })),
    ...pending
      .filter((p) => !sent.has(p.clientId))
      .map((p) => ({
        senderId: meId,
        createdAt: p.createdAt,
        row: {
          key: `${meId}:${p.clientId}`,
          id: null,
          message: null,
          pending: p,
          text: p.text,
          entities: p.entities,
          spoiler: p.spoiler,
          replyTo: p.replyTo,
          createdAt: p.createdAt,
          mine: true,
          deleted: false,
          edited: false,
          attachment: p.attachment
            ? { source: "local" as const, data: p.attachment, failed: p.status === "failed" }
            : null,
          sticker: p.sticker,
          type: (p.sticker ? "sticker" : (p.attachment?.kind ?? "text")) as MessageDTO["type"],
          reveal: null,
          ephemeral: p.ephemeral
            ? {
                maxViews: p.ephemeral.maxViews ?? null,
                ttlSeconds: p.ephemeral.ttlSeconds ?? null,
                views: 0,
                firstViewedAt: null,
                locked: false,
                expired: false,
                purged: false,
                resendsLeft: EPHEMERAL_RESEND.max,
                resendUntil: null,
              }
            : null,
        },
      })),
  ];

  const rows: Row[] = [];
  items.forEach((it, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !sameDay(prev.createdAt, it.createdAt)) {
      rows.push({ kind: "day", key: `day:${it.createdAt}`, label: dayLabel(it.createdAt) });
    }
    const r = it.row;
    if (r.message?.type === "service") {
      rows.push({ kind: "service", key: r.key, message: r.message });
      return;
    }
    const close = (a?: Item) =>
      !!a &&
      a.row.type !== "service" &&
      a.senderId === it.senderId &&
      sameDay(a.createdAt, it.createdAt) &&
      Math.abs(Date.parse(a.createdAt) - Date.parse(it.createdAt)) < 5 * 60_000;
    rows.push({
      ...r,
      kind: "msg",
      groupStart: !close(prev),
      groupEnd: !close(next),
      delivery:
        !r.mine || r.deleted
          ? null
          : r.pending
            ? r.pending.status
            : Date.parse(r.createdAt) <= peerReadAt
              ? "read"
              : Date.parse(r.createdAt) <= peerDeliveredAt
                ? "delivered"
                : "sent",
    });
  });
  return rows;
}

/** On a white-on-dark pill read ticks turn sky blue; inside a bubble they keep its text colour at full strength. */
function Ticks({ delivery, pill = false }: { delivery: Delivery; pill?: boolean }) {
  if (delivery === "sending") return <Clock aria-label="Sending" className="size-3" />;
  if (delivery === "failed") return null;
  const label = { sent: "Sent", delivered: "Delivered", read: "Read" }[delivery];
  return (
    <span
      aria-label={label}
      title={label}
      className={delivery === "read" ? (pill ? "text-sky-300" : "") : pill ? "" : "opacity-70"}
    >
      {delivery === "sent" ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : (
        <CheckCheck className="size-3.5" strokeWidth={2.5} />
      )}
    </span>
  );
}

function Quote({
  reply,
  name,
  mine,
  onClick,
}: {
  reply: ReplyPreview;
  name: string;
  mine: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-[13px] leading-snug ${
        mine ? "border-brand-ink/40 bg-black/10" : "border-brand bg-black/5 dark:bg-white/10"
      }`}
    >
      <span className="block font-semibold">{name}</span>
      <span className={`line-clamp-2 ${reply.deleted || reply.spoiler ? "italic opacity-70" : "opacity-80"}`}>
        {reply.deleted ? (
          "Message deleted"
        ) : reply.ephemeral ? (
          <span className="inline-flex items-center gap-1">
            <Flame className="size-3.5" /> Self-destructing message
          </span>
        ) : reply.spoiler ? (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="size-3.5" /> Spoiler
          </span>
        ) : reply.type !== "text" && reply.type !== "service" ? (
          <span className="inline-flex items-center gap-1">
            <MediaLabel type={reply.type} />
            {reply.text && <span className="truncate">· {reply.text}</span>}
          </span>
        ) : (
          reply.text
        )}
      </span>
    </button>
  );
}

const mediaLabels = {
  image: { Icon: ImageIcon, label: "Photo" },
  video: { Icon: Video, label: "Video" },
  video_note: { Icon: CircleUserRound, label: "Video message" },
  voice: { Icon: Mic, label: "Voice message" },
  file: { Icon: Paperclip, label: "File" },
  gif: { Icon: Film, label: "GIF" },
  sticker: { Icon: StickerIcon, label: "Sticker" },
} as const;

export function MediaLabel({ type }: { type: keyof typeof mediaLabels }) {
  const { Icon, label } = mediaLabels[type];
  return (
    <>
      <Icon className="size-3.5 shrink-0" /> {label}
    </>
  );
}

function MessageText({ row, selectable }: { row: MsgRow; selectable: boolean }) {
  const revealed = useSpoilers((s) => !!s.revealed[row.key]);
  const reveal = useSpoilers((s) => s.reveal);
  const text = row.text ?? "";
  const entities =
    row.spoiler && !row.attachment
      ? [...row.entities, { type: "spoiler" as const, offset: 0, length: text.length }]
      : row.entities;
  if (entities.length === 0) return <>{text}</>;

  return (
    <>
      {segments(text, entities).map((seg, i) => {
        const styled = <Styled styles={seg.styles}>{seg.text}</Styled>;
        if (!seg.styles.has("spoiler") || revealed) return <span key={i}>{styled}</span>;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label="Spoiler, tap to reveal"
            onClick={(e) => {
              if (selectable) return;
              e.stopPropagation();
              reveal(row.key);
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && reveal(row.key)}
            className="spoiler cursor-pointer"
          >
            {styled}
          </span>
        );
      })}
    </>
  );
}

function Sealed({ row, onOpen }: { row: MsgRow; onOpen: () => void }) {
  const e = row.ephemeral!;
  const kind = row.type === "text" || row.type === "service" ? "Message" : mediaLabels[row.type].label;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={e.expired}
      className="flex min-w-48 items-center gap-3 py-1 text-left disabled:cursor-default"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${
          e.expired ? "bg-stone-500/15 text-stone-500" : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
        }`}
      >
        <Flame className={`size-5 ${e.expired ? "" : "fill-current"}`} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{e.expired ? "Opened" : "Tap to view"}</span>
        <span className="block text-xs opacity-70">
          {kind} · {shortRule(e)}
        </span>
      </span>
    </button>
  );
}

function RevealBar({ expiresAt, onHide }: { expiresAt: string | null; onHide: () => void }) {
  const deadline = expiresAt ? Date.parse(expiresAt) : null;
  const [now, setNow] = useState(Date.now());
  const left = deadline ? Math.max(0, deadline - now) : null;

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [deadline]);

  useEffect(() => {
    if (left === 0) onHide();
  }, [left, onHide]);

  return (
    <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
      <Flame className="size-3.5 fill-current" />
      <span className="flex-1">{left === null ? "Disappears when you hide it" : `${Math.ceil(left / 1000)}s`}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onHide();
        }}
        aria-label="Hide"
        className="grid size-5 place-items-center rounded-full hover:bg-orange-500/15"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export const canResend = (e: EphemeralDTO) =>
  e.expired && !e.purged && e.resendsLeft > 0 && !!e.resendUntil && Date.now() < Date.parse(e.resendUntil);

function SenderBadge({ e, onResend }: { e: EphemeralDTO; onResend: () => void }) {
  return (
    <span className="mb-0.5 flex items-center gap-1 text-[11px] opacity-80">
      <Flame className="size-3" />
      {shortRule(e)} · {e.expired || e.views ? `Opened${e.views > 1 ? ` ${e.views}×` : ""}` : "Not opened"}
      {canResend(e) && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onResend();
          }}
          className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-black/10 px-1.5 py-0.5 font-semibold hover:bg-black/20 dark:bg-white/10"
        >
          <RotateCcw className="size-3" /> Resend ({e.resendsLeft} left)
        </button>
      )}
    </span>
  );
}

function Bubble({
  row,
  highlighted,
  selecting,
  selected,
  nameOf,
  onMenu,
  onQuote,
  onToggle,
  onOpen,
  onOpenEphemeral,
  onHideReveal,
  onResend,
  onOpenPack,
  meId,
  onReact,
  onLongPress,
  onReactButton,
}: {
  row: MsgRow;
  highlighted: boolean;
  selecting: boolean;
  selected: boolean;
  nameOf: (userId: string) => string;
  onMenu: () => void;
  onQuote: (id: string) => void;
  onToggle: () => void;
  onOpen: (item: LightboxItem) => void;
  onOpenEphemeral: () => void;
  onHideReveal: () => void;
  onResend: () => void;
  onOpenPack: (packId: string) => void;
  meId: string;
  onReact: (emoji: string) => void;
  onLongPress: (anchor: DOMRect) => void;
  onReactButton: (anchor: DOMRect) => void;
}) {
  const selectable = selecting && row.message !== null;
  const bubble = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const anchor = () => bubble.current!.getBoundingClientRect();
  const press = useLongPress(selectable ? onToggle : () => onLongPress(anchor()));
  const reactable = !selecting && canReact(row);

  function onTap(e: React.MouseEvent) {
    if (!reactable || (e.target as Element).closest("a, button, video, audio, input")) return;
    if (e.timeStamp - lastTap.current < 300) {
      lastTap.current = 0;
      onReact("❤️");
    } else lastTap.current = e.timeStamp;
  }
  const mediaRevealed = useSpoilers((s) => !!s.revealed[row.key]);
  const revealMedia = useSpoilers((s) => s.reveal);
  const { mine, groupStart, groupEnd } = row;
  const e = row.ephemeral;
  const sealed = !!e && (e.locked || (e.expired && (!row.mine || e.purged)));
  const jumbo =
    !row.deleted &&
    !row.ephemeral &&
    !row.attachment &&
    !row.spoiler &&
    !row.replyTo &&
    row.entities.length === 0 &&
    row.text
      ? emojiOnly(row.text)
      : null;
  const visual = !sealed && row.attachment && ["image", "video", "gif"].includes(row.attachment.data.kind);
  const note = !sealed && row.attachment?.data.kind === "video_note" && !row.deleted;
  const sticker = !sealed && !row.deleted ? row.sticker : null;
  const hasText = !!row.text || row.deleted;
  const radius = mine
    ? `rounded-tl-2xl rounded-bl-2xl ${groupStart ? "rounded-tr-2xl" : "rounded-tr-md"} ${groupEnd ? "rounded-br-2xl" : "rounded-br-md"}`
    : `rounded-tr-2xl rounded-br-2xl ${groupStart ? "rounded-tl-2xl" : "rounded-tl-md"} ${groupEnd ? "rounded-bl-2xl" : "rounded-bl-md"}`;
  const tone =
    jumbo || note || sticker
      ? "bg-transparent text-stone-900 dark:text-stone-100"
      : row.deleted
        ? "bg-transparent text-stone-500 ring-1 ring-inset ring-stone-300 dark:ring-stone-700"
        : mine
          ? "bg-brand text-brand-ink"
          : "bg-(--bubble-their) text-(--bubble-their-ink) ring-1 ring-inset ring-stone-200 dark:ring-stone-700";

  return (
    <div
      onClickCapture={
        selectable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }
          : undefined
      }
      className={`group flex items-center gap-2 px-3 ${selectable ? "cursor-pointer" : ""} ${
        selected ? "bg-brand/10" : ""
      } ${groupEnd ? "pb-3" : "pb-1"}`}
    >
      {selecting && (
        <span className={`shrink-0 ${row.message ? "" : "invisible"}`} aria-hidden>
          {selected ? (
            <CheckCircle2 className="size-5 fill-brand text-white dark:text-stone-950" />
          ) : (
            <Circle className="size-5 text-stone-400" />
          )}
        </span>
      )}
      <div className={`flex min-w-0 flex-1 ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`flex max-w-[80%] items-center gap-1 md:max-w-[65%] ${mine ? "flex-row-reverse" : ""}`}>
          <div className="flex min-w-0 flex-col items-end gap-1">
            <div
              ref={bubble}
              {...press}
              onClick={onTap}
              onMouseDown={(e) => reactable && e.detail > 1 && e.preventDefault()}
              className={`${radius} ${tone} ${jumbo || note || sticker ? "" : visual ? "p-1" : "px-3 py-1.5"} transition-shadow touch-manipulation [-webkit-touch-callout:none] pointer-coarse:select-none ${
                row.delivery === "failed" ? "opacity-60" : ""
              } ${highlighted ? "ring-4 ring-sky-400/60" : ""}`}
            >
              {row.replyTo && !row.deleted && (
                <Quote
                  reply={row.replyTo}
                  mine={mine}
                  name={nameOf(row.replyTo.senderId)}
                  onClick={() => onQuote(row.replyTo!.id)}
                />
              )}
              {row.reveal ? (
                <RevealBar expiresAt={row.reveal.expiresAt} onHide={onHideReveal} />
              ) : (
                row.ephemeral && !sealed && !row.deleted && <SenderBadge e={row.ephemeral} onResend={onResend} />
              )}
              {row.attachment && !row.deleted && !sealed && (
                <AttachmentView
                  attachment={row.attachment}
                  mine={mine}
                  onOpen={onOpen}
                  hidden={row.spoiler && !mediaRevealed}
                  onReveal={() => revealMedia(row.key)}
                  autoPlay={!!row.reveal}
                />
              )}
              {sealed ? (
                <div className="flex items-end gap-2">
                  <Sealed row={row} onOpen={onOpenEphemeral} />
                  <span className="mb-1 flex shrink-0 items-center gap-1 text-[11px] leading-none">
                    <span className="opacity-70">{clockTime(row.createdAt)}</span>
                    {row.delivery && <Ticks delivery={row.delivery} />}
                  </span>
                </div>
              ) : sticker ? (
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => onOpenPack(sticker.packId)}
                    aria-label={`${sticker.emoji} sticker, see its pack`}
                  >
                    <StickerView sticker={sticker} size={160} />
                  </button>
                  <span className="flex items-center gap-1 rounded-full bg-stone-900/40 px-2 py-0.5 text-[11px] leading-none text-white">
                    {clockTime(row.createdAt)}
                    {row.delivery && <Ticks delivery={row.delivery} pill />}
                  </span>
                </div>
              ) : jumbo ? (
                <div className="flex flex-col items-end">
                  <div className="flex">
                    {jumbo.map((e, i) => (
                      <AnimatedEmoji key={`${e}:${i}`} emoji={e} size={jumbo.length === 1 ? 112 : 80} />
                    ))}
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-stone-900/40 px-2 py-0.5 text-[11px] leading-none text-white">
                    {row.edited && <span>edited</span>}
                    {clockTime(row.createdAt)}
                    {row.delivery && <Ticks delivery={row.delivery} pill />}
                  </span>
                </div>
              ) : (
                <p
                  className={`whitespace-pre-wrap break-words text-[15px] leading-snug ${row.deleted ? "italic" : ""} ${
                    visual ? "px-2 pt-1 pb-0.5" : ""
                  } ${!hasText ? "-mt-0.5 min-h-4" : ""}`}
                >
                  {!hasText ? null : row.deleted ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Ban className="size-4" /> This message was deleted
                    </span>
                  ) : (
                    <MessageText row={row} selectable={selectable} />
                  )}
                  <span className="float-right ml-2 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none">
                    {row.edited && !row.deleted && <span className="opacity-70">edited</span>}
                    <span className="opacity-70">{clockTime(row.createdAt)}</span>
                    {row.delivery && <Ticks delivery={row.delivery} />}
                  </span>
                </p>
              )}
            </div>
            {row.message && !row.deleted && (
              <ReactionChips message={row.message} meId={meId} mine={mine} nameOf={nameOf} onReact={onReact} />
            )}
            {row.delivery === "failed" && (
              <button onClick={onMenu} className="text-xs font-medium text-red-600 dark:text-red-400">
                Not sent · Tap for options
              </button>
            )}
          </div>
          {reactable && (
            <button
              onClick={() => onReactButton(anchor())}
              aria-label="React"
              className="hidden size-7 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-200 group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:hover:bg-stone-800"
            >
              <SmilePlus className="size-4" />
            </button>
          )}
          <button
            onClick={onMenu}
            aria-label="Message options"
            className="hidden size-7 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-200 group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:hover:bg-stone-800"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const canReact = (row: MsgRow) =>
  !!row.message && !row.pending && !row.deleted && row.message.type !== "service" && !row.message.ephemeral?.purged;

export interface MessageListHandle {
  scrollToBottom: () => void;
}

export const MessageList = forwardRef<MessageListHandle, { chat: ChatDTO; meId: string; onSeen: () => void }>(
  function MessageList({ chat, meId, onSeen }, handle) {
    const qc = useQueryClient();
    const { realtime } = useRealtime();
    const messages = useMessages(chat.id);
    const pending = usePending(chat.id);
    const setMode = useComposerMode((s) => s.set);
    const selecting = useSelection((s) => s.chatId === chat.id);
    const selectedIds = useSelection((s) => s.ids);
    const startSelection = useSelection((s) => s.start);
    const toggleSelected = useSelection((s) => s.toggle);
    const list = useRef<VListHandle>(null);
    const atBottom = useRef(true);
    const initialScrollDone = useRef(false);
    const [menuFor, setMenuFor] = useState<MsgRow | null>(null);
    const [reporting, setReporting] = useState<MessageDTO | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
    const [packFor, setPackFor] = useState<string | null>(null);
    const [reactFor, setReactFor] = useState<MessageDTO | null>(null);
    const [reactAt, setReactAt] = useState<{ row: MsgRow; anchor: DOMRect } | null>(null);
    const closeReactBar = useCallback(() => setReactAt(null), []);
    const [opened, setOpened] = useState<Record<string, ViewMessageResult>>({});
    const openedRef = useRef(opened);
    openedRef.current = opened;
    const hideReveal = useCallback(
      (id: string) => {
        const shown = openedRef.current[id];
        const e = shown?.message.ephemeral;
        const endsAt = shown?.expiresAt ? Date.parse(shown.expiresAt) : null;
        const viewsUsed = !!e?.maxViews && e.views >= e.maxViews;
        if (viewsUsed || (endsAt !== null && Date.now() >= endsAt - 250)) markOpenedLocally(qc, chat.id, id);
        else if (endsAt !== null) setTimeout(() => markOpenedLocally(qc, chat.id, id), endsAt - Date.now());
        setOpened((all) => {
          const { [id]: _gone, ...rest } = all;
          return rest;
        });
      },
      [qc, chat.id],
    );

    async function resendEphemeral(m: MessageDTO) {
      try {
        applyEdited(qc, unwrap(await six.api.POST("/v1/messages/{id}/resend", { params: { path: { id: m.id } } })));
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      }
    }

    async function openEphemeral(row: MsgRow) {
      const id = row.id;
      if (!id) return;
      try {
        const result = unwrap(await six.api.POST("/v1/messages/{id}/view", { params: { path: { id } } }));
        setOpened((all) => ({ ...all, [id]: result }));
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      }
    }

    const names = useMemo(() => new Map(chat.members.map((m) => [m.user.id, m.user.displayName])), [chat.members]);
    const nameOf = (id: string) => (id === meId ? "You" : (names.get(id) ?? "Someone"));

    const { peerDeliveredAt, peerReadAt } = useMemo(() => {
      const peers = chat.members.filter((m) => m.user.id !== meId);
      const earliest = (pick: (m: (typeof peers)[number]) => string | null) =>
        peers.length ? Math.min(...peers.map((m) => (pick(m) ? Date.parse(pick(m)!) : 0))) : 0;
      return { peerDeliveredAt: earliest((m) => m.lastDeliveredAt), peerReadAt: earliest((m) => m.lastReadAt) };
    }, [chat.members, meId]);

    const ordered = useMemo(
      () => (messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse(),
      [messages.data],
    );
    const baseRows = useMemo(
      () => buildRows(ordered, pending, meId, peerDeliveredAt, peerReadAt),
      [ordered, pending, meId, peerDeliveredAt, peerReadAt],
    );
    const rows = useMemo(
      () =>
        baseRows.map((row): Row => {
          const shown = row.kind === "msg" && row.id ? opened[row.id] : undefined;
          if (!shown || row.kind !== "msg") return row;
          const m = shown.message;
          return {
            ...row,
            text: m.text,
            entities: m.entities,
            attachment: m.attachment ? { source: "server", data: m.attachment } : null,
            ephemeral: m.ephemeral && { ...m.ephemeral, locked: false, expired: false },
            reveal: { expiresAt: shown.expiresAt },
          };
        }),
      [baseRows, opened],
    );

    const firstKey = useRef<string | undefined>(undefined);
    const lastKey = useRef<string | undefined>(undefined);
    const shift = firstKey.current !== undefined && rows[0]?.key !== firstKey.current;

    const scrollToBottom = () => {
      if (rows.length) list.current?.scrollToIndex(rows.length - 1, { align: "end" });
    };
    useImperativeHandle(handle, () => ({ scrollToBottom }));

    useLayoutEffect(() => {
      const appended = rows.length > 0 && rows[rows.length - 1]!.key !== lastKey.current;
      if (!initialScrollDone.current && rows.length) {
        initialScrollDone.current = true;
        scrollToBottom();
      } else if (appended && atBottom.current) {
        scrollToBottom();
      }
      firstKey.current = rows[0]?.key;
      lastKey.current = rows[rows.length - 1]?.key;
    });

    useEffect(() => {
      if (atBottom.current) onSeen();
    }, [chat.lastMessage?.id, onSeen]);

    useEffect(() => {
      if (!highlight) return;
      const t = setTimeout(() => setHighlight(null), 1200);
      return () => clearTimeout(t);
    }, [highlight]);

    function onScroll(offset: number) {
      const h = list.current;
      if (!h) return;
      const wasAtBottom = atBottom.current;
      atBottom.current = offset + h.viewportSize >= h.scrollSize - 80;
      if (atBottom.current && !wasAtBottom) onSeen();
      if (offset < 300 && messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
    }

    function jumpTo(id: string) {
      const index = rows.findIndex((r) => r.kind === "msg" && r.id === id);
      if (index < 0) return;
      list.current?.scrollToIndex(index, { align: "center", smooth: true });
      setHighlight(id);
    }

    function actionsFor(row: MsgRow): SheetAction[] {
      if (row.pending) {
        const p = row.pending;
        return [
          ...(p.status === "failed" && realtime
            ? [{ label: "Retry", onSelect: () => void deliver(qc, realtime, p) }]
            : []),
          { label: "Discard", destructive: true, onSelect: () => useOutbox.getState().remove(p.chatId, p.clientId) },
        ];
      }
      const m = row.message!;
      if (row.deleted) {
        return [
          { label: "Select", onSelect: () => startSelection(chat.id, m.id) },
          ...(chat.type === "direct" || row.mine
            ? [
                {
                  label: chat.type === "direct" ? `Remove for me and ${chat.title}` : "Remove for everyone",
                  destructive: true,
                  onSelect: () => void deleteMessage(qc, m, "all").catch(() => null),
                },
              ]
            : []),
          {
            label: "Remove for me",
            destructive: true,
            onSelect: () => void deleteMessage(qc, m, "me").catch(() => null),
          },
        ];
      }
      return [
        { label: "Reply", onSelect: () => setMode(chat.id, { kind: "reply", message: m }) },
        { label: "Select", onSelect: () => startSelection(chat.id, m.id) },
        ...(m.ephemeral && canResend(m.ephemeral)
          ? [{ label: "Resend so they can open it again", onSelect: () => void resendEphemeral(m) }]
          : []),
        ...(m.ephemeral
          ? []
          : [
              ...(m.text ? [{ label: "Copy", onSelect: () => void navigator.clipboard.writeText(m.text ?? "") }] : []),
              ...(row.mine && m.type !== "sticker"
                ? [{ label: "Edit", onSelect: () => setMode(chat.id, { kind: "edit", message: m }) }]
                : []),
            ]),
        ...(row.mine ? [] : [{ label: "Report", onSelect: () => setReporting(m) }]),
        { label: "Delete", destructive: true, onSelect: () => setConfirmDelete(m) },
      ];
    }

    if (messages.isPending) {
      return <div className="grid flex-1 place-items-center text-sm text-stone-500">Loading…</div>;
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end">
        {rows.length === 0 && (
          <div className="flex flex-col items-center pb-8 text-center text-sm">
            <span className="rounded-full bg-black/25 px-4 py-1.5 text-white backdrop-blur-sm">
              No messages yet. Say hello!
            </span>
          </div>
        )}
        <VList
          ref={list}
          data={rows}
          shift={shift}
          onScroll={onScroll}
          className="overscroll-contain py-2"
          style={{ height: "auto", maxHeight: "100%", contain: "content" }}
        >
          {(row) =>
            row.kind === "day" ? (
              <div key={row.key} className="flex justify-center py-3">
                <span className="rounded-full bg-black/25 px-3 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  {row.label}
                </span>
              </div>
            ) : row.kind === "service" ? (
              <div key={row.key} className="flex justify-center px-6 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-center text-xs text-white backdrop-blur-sm">
                  {row.message.action?.type === "theme" ? (
                    <Palette className="size-3.5 shrink-0" />
                  ) : (
                    <Timer className="size-3.5 shrink-0" />
                  )}
                  {nameOf(row.message.senderId)} {serviceSentence(row.message)}
                </span>
              </div>
            ) : (
              <Bubble
                key={row.key}
                row={row}
                highlighted={row.id !== null && row.id === highlight}
                selecting={selecting}
                selected={row.id !== null && selecting && selectedIds.includes(row.id)}
                nameOf={nameOf}
                onMenu={() => setMenuFor(row)}
                onQuote={jumpTo}
                onToggle={() => row.id && toggleSelected(row.id)}
                onOpen={setLightbox}
                onOpenEphemeral={() => void openEphemeral(row)}
                onHideReveal={() => row.id && hideReveal(row.id)}
                onResend={() => row.message && void resendEphemeral(row.message)}
                onOpenPack={setPackFor}
                meId={meId}
                onReact={(emoji) => row.message && void react(qc, row.message, meId, emoji)}
                onLongPress={(anchor) => {
                  setMenuFor(row);
                  if (canReact(row)) setReactAt({ row, anchor });
                }}
                onReactButton={(anchor) => setReactAt({ row, anchor })}
              />
            )
          }
        </VList>

        {menuFor && (
          <Sheet
            actions={actionsFor(menuFor)}
            onClose={() => {
              setMenuFor(null);
              setReactAt(null);
            }}
          />
        )}
        {reactAt && (
          <ReactionPopover
            anchor={reactAt.anchor}
            alignEnd={reactAt.row.mine}
            message={reactAt.row.message!}
            meId={meId}
            onReact={(emoji) => {
              setReactAt(null);
              setMenuFor(null);
              void react(qc, reactAt.row.message!, meId, emoji);
            }}
            onMore={() => {
              setReactAt(null);
              setMenuFor(null);
              setReactFor(reactAt.row.message);
            }}
            onClose={closeReactBar}
          />
        )}
        {reactFor && (
          <ReactionPicker
            onPick={(emoji) => void react(qc, reactFor, meId, emoji)}
            onClose={() => setReactFor(null)}
          />
        )}
        {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
        {reporting && (
          <ReportDialog
            target={{ messageId: reporting.id }}
            title="Report message"
            onClose={() => setReporting(null)}
          />
        )}
        {packFor && <PackDialog packId={packFor} onClose={() => setPackFor(null)} />}
        {confirmDelete && (
          <Sheet
            title="Delete message?"
            onClose={() => setConfirmDelete(null)}
            actions={[
              ...(chat.type === "direct" || confirmDelete.senderId === meId
                ? [
                    {
                      label: chat.type === "direct" ? `Delete for me and ${chat.title}` : "Delete for everyone",
                      destructive: true,
                      onSelect: () => void deleteMessage(qc, confirmDelete, "all").catch(() => null),
                    },
                  ]
                : []),
              {
                label: "Delete for me",
                destructive: true,
                onSelect: () => void deleteMessage(qc, confirmDelete, "me").catch(() => null),
              },
            ]}
          />
        )}
      </div>
    );
  },
);
