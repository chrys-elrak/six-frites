"use client";

import type { ChatDTO, MessageDTO, MessageEntity, ReplyPreview } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  EyeOff,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { VList, type VListHandle } from "virtua";
import { deleteMessage } from "@/lib/actions";
import { useMessages } from "@/lib/chats";
import { useComposerMode } from "@/lib/composer";
import { clockTime, dayLabel, sameDay } from "@/lib/format";
import { useLongPress } from "@/lib/long-press";
import { type PendingMessage, useOutbox, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { deliver } from "@/lib/send";
import { useSelection } from "@/lib/selection";
import { useSpoilers } from "@/lib/spoilers";
import { Sheet, type SheetAction } from "./sheet";

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
  groupStart: boolean;
  groupEnd: boolean;
  delivery: Delivery | null;
}

type Row = { kind: "day"; key: string; label: string } | MsgRow;

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
    const close = (a?: Item) =>
      !!a &&
      a.senderId === it.senderId &&
      sameDay(a.createdAt, it.createdAt) &&
      Math.abs(Date.parse(a.createdAt) - Date.parse(it.createdAt)) < 5 * 60_000;
    const r = it.row;
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

function Ticks({ delivery }: { delivery: Delivery }) {
  if (delivery === "sending") return <Clock aria-label="Sending" className="size-3" />;
  if (delivery === "failed") return null;
  const label = { sent: "Sent", delivered: "Delivered", read: "Read" }[delivery];
  return (
    <span aria-label={label} title={label} className={delivery === "read" ? "text-sky-700 dark:text-sky-300" : ""}>
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
        mine ? "border-brand-ink/40 bg-black/10" : "border-brand bg-stone-100 dark:bg-stone-700/60"
      }`}
    >
      <span className="block font-semibold">{name}</span>
      <span className={`line-clamp-2 ${reply.deleted || reply.spoiler ? "italic opacity-70" : "opacity-80"}`}>
        {reply.deleted ? (
          "Message deleted"
        ) : reply.spoiler ? (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="size-3.5" /> Spoiler
          </span>
        ) : (
          reply.text
        )}
      </span>
    </button>
  );
}

function MessageText({ row, selectable }: { row: MsgRow; selectable: boolean }) {
  const revealed = useSpoilers((s) => !!s.revealed[row.key]);
  const reveal = useSpoilers((s) => s.reveal);
  const text = row.text ?? "";
  const ranges = row.spoiler ? [{ offset: 0, length: text.length }] : row.entities;
  if (revealed || ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.offset > cursor) parts.push(text.slice(cursor, r.offset));
    parts.push(
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
        {text.slice(r.offset, r.offset + r.length)}
      </span>,
    );
    cursor = r.offset + r.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
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
}: {
  row: MsgRow;
  highlighted: boolean;
  selecting: boolean;
  selected: boolean;
  nameOf: (userId: string) => string;
  onMenu: () => void;
  onQuote: (id: string) => void;
  onToggle: () => void;
}) {
  const selectable = selecting && row.message !== null;
  const press = useLongPress(selectable ? onToggle : onMenu);
  const { mine, groupStart, groupEnd } = row;
  const radius = mine
    ? `rounded-2xl ${groupStart ? "" : "rounded-tr-md"} ${groupEnd ? "" : "rounded-br-md"}`
    : `rounded-2xl ${groupStart ? "" : "rounded-tl-md"} ${groupEnd ? "" : "rounded-bl-md"}`;
  const tone = row.deleted
    ? "bg-transparent text-stone-500 ring-1 ring-stone-300 dark:ring-stone-700"
    : mine
      ? "bg-brand text-brand-ink"
      : "bg-white text-stone-900 ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700";

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
      } ${groupEnd ? "pb-2" : "pb-0.5"}`}
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
              {...press}
              className={`${radius} ${tone} px-3 py-1.5 transition-shadow touch-manipulation [-webkit-touch-callout:none] pointer-coarse:select-none ${
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
              <p className={`whitespace-pre-wrap break-words text-[15px] leading-snug ${row.deleted ? "italic" : ""}`}>
                {row.deleted ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Ban className="size-4" /> This message was deleted
                  </span>
                ) : (
                  <MessageText row={row} selectable={selectable} />
                )}
                <span className="float-right ml-2 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none opacity-70">
                  {row.edited && !row.deleted && <span>edited</span>}
                  {clockTime(row.createdAt)}
                  {row.delivery && <Ticks delivery={row.delivery} />}
                </span>
              </p>
            </div>
            {row.delivery === "failed" && (
              <button onClick={onMenu} className="text-xs font-medium text-red-600 dark:text-red-400">
                Not sent · Tap for options
              </button>
            )}
          </div>
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
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);

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
    const rows = useMemo(
      () => buildRows(ordered, pending, meId, peerDeliveredAt, peerReadAt),
      [ordered, pending, meId, peerDeliveredAt, peerReadAt],
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
        { label: "Copy", onSelect: () => void navigator.clipboard.writeText(m.text ?? "") },
        ...(row.mine ? [{ label: "Edit", onSelect: () => setMode(chat.id, { kind: "edit", message: m }) }] : []),
        { label: "Delete", destructive: true, onSelect: () => setConfirmDelete(m) },
      ];
    }

    if (messages.isPending) {
      return <div className="grid flex-1 place-items-center text-sm text-stone-500">Loading…</div>;
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end">
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 pb-8 text-center text-sm text-stone-500">
            <MessageCircle className="size-8 text-stone-400" strokeWidth={1.6} />
            No messages yet. Say hello!
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
                <span className="rounded-full bg-stone-200/80 px-3 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  {row.label}
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
              />
            )
          }
        </VList>

        {menuFor && <Sheet actions={actionsFor(menuFor)} onClose={() => setMenuFor(null)} />}
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
