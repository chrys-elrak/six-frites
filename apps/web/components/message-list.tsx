"use client";

import type { ChatDTO, MessageDTO, ReplyPreview } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
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
import { Sheet, type SheetAction } from "./sheet";

type Delivery = "sending" | "failed" | "sent" | "read";

interface MsgRow {
  kind: "msg";
  key: string;
  id: string | null;
  message: MessageDTO | null;
  pending: PendingMessage | null;
  text: string | null;
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

function buildRows(messages: MessageDTO[], pending: PendingMessage[], meId: string, peerReadAt: number): Row[] {
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
              : "sent",
    });
  });
  return rows;
}

function Ticks({ delivery }: { delivery: Delivery }) {
  if (delivery === "sending") return <span aria-label="Sending">🕓</span>;
  if (delivery === "failed") return null;
  return (
    <span
      aria-label={delivery === "read" ? "Read" : "Sent"}
      className={delivery === "read" ? "text-sky-700 dark:text-sky-300" : ""}
    >
      {delivery === "read" ? "✓✓" : "✓"}
    </span>
  );
}

function Quote({ reply, name, mine, onClick }: { reply: ReplyPreview; name: string; mine: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-[13px] leading-snug ${
        mine ? "border-brand-ink/40 bg-black/10" : "border-brand bg-stone-100 dark:bg-stone-700/60"
      }`}
    >
      <span className="block font-semibold">{name}</span>
      <span className={`line-clamp-2 ${reply.deleted ? "italic opacity-70" : "opacity-80"}`}>
        {reply.deleted ? "Message deleted" : reply.text}
      </span>
    </button>
  );
}

function Bubble({
  row,
  highlighted,
  nameOf,
  onMenu,
  onQuote,
}: {
  row: MsgRow;
  highlighted: boolean;
  nameOf: (userId: string) => string;
  onMenu: () => void;
  onQuote: (id: string) => void;
}) {
  const press = useLongPress(onMenu);
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
    <div className={`group flex px-3 ${mine ? "justify-end" : "justify-start"} ${groupEnd ? "pb-2" : "pb-0.5"}`}>
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
              {row.deleted ? "🚫 This message was deleted" : row.text}
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
          ⋯
        </button>
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
    const list = useRef<VListHandle>(null);
    const atBottom = useRef(true);
    const initialScrollDone = useRef(false);
    const [menuFor, setMenuFor] = useState<MsgRow | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);

    const names = useMemo(() => new Map(chat.members.map((m) => [m.user.id, m.user.displayName])), [chat.members]);
    const nameOf = (id: string) => (id === meId ? "You" : (names.get(id) ?? "Someone"));

    const peerReadAt = useMemo(() => {
      const times = chat.members
        .filter((m) => m.user.id !== meId)
        .map((m) => (m.lastReadAt ? Date.parse(m.lastReadAt) : 0));
      return times.length ? Math.min(...times) : 0;
    }, [chat.members, meId]);

    const ordered = useMemo(
      () => (messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse(),
      [messages.data],
    );
    const rows = useMemo(() => buildRows(ordered, pending, meId, peerReadAt), [ordered, pending, meId, peerReadAt]);

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
          ...(p.status === "failed" && realtime ? [{ label: "Retry", onSelect: () => void deliver(qc, realtime, p) }] : []),
          { label: "Discard", destructive: true, onSelect: () => useOutbox.getState().remove(p.chatId, p.clientId) },
        ];
      }
      const m = row.message!;
      if (row.deleted) {
        return [{ label: "Delete for me", destructive: true, onSelect: () => void deleteMessage(qc, m, "me").catch(() => null) }];
      }
      return [
        { label: "Reply", onSelect: () => setMode(chat.id, { kind: "reply", message: m }) },
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
        {rows.length === 0 && <p className="pb-6 text-center text-sm text-stone-500">No messages yet. Say hi 👋</p>}
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
                nameOf={nameOf}
                onMenu={() => setMenuFor(row)}
                onQuote={jumpTo}
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
              { label: "Delete for me", destructive: true, onSelect: () => void deleteMessage(qc, confirmDelete, "me").catch(() => null) },
            ]}
          />
        )}
      </div>
    );
  },
);
