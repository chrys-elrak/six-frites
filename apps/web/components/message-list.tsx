"use client";

import type { ChatDTO, MessageDTO } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { VList, type VListHandle } from "virtua";
import { useMessages } from "@/lib/chats";
import { clockTime, dayLabel, sameDay } from "@/lib/format";
import { type PendingMessage, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { deliver } from "@/lib/send";

type Delivery = "sending" | "failed" | "sent" | "read";

type Row =
  | { kind: "day"; key: string; label: string }
  | {
      kind: "msg";
      key: string;
      text: string;
      createdAt: string;
      mine: boolean;
      groupStart: boolean;
      groupEnd: boolean;
      delivery: Delivery | null;
      pending?: PendingMessage;
    };

interface Item {
  senderId: string;
  clientId: string;
  text: string;
  createdAt: string;
  pending?: PendingMessage;
}

function buildRows(messages: MessageDTO[], pending: PendingMessage[], meId: string, peerReadAt: number): Row[] {
  const items: Item[] = [
    ...messages.map((m) => ({ senderId: m.senderId, clientId: m.clientId, text: m.text ?? "", createdAt: m.createdAt })),
    ...pending
      .filter((p) => !messages.some((m) => m.senderId === meId && m.clientId === p.clientId))
      .map((p) => ({ senderId: meId, clientId: p.clientId, text: p.text, createdAt: p.createdAt, pending: p })),
  ];

  const rows: Row[] = [];
  items.forEach((it, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !sameDay(prev.createdAt, it.createdAt)) {
      rows.push({ kind: "day", key: `day:${it.createdAt.slice(0, 10)}:${i}`, label: dayLabel(it.createdAt) });
    }
    const close = (a?: Item) =>
      !!a && a.senderId === it.senderId && sameDay(a.createdAt, it.createdAt) &&
      Math.abs(Date.parse(a.createdAt) - Date.parse(it.createdAt)) < 5 * 60_000;
    const mine = it.senderId === meId;
    rows.push({
      kind: "msg",
      key: `${it.senderId}:${it.clientId}`,
      text: it.text,
      createdAt: it.createdAt,
      mine,
      groupStart: !close(prev),
      groupEnd: !close(next),
      delivery: !mine ? null : it.pending ? it.pending.status : Date.parse(it.createdAt) <= peerReadAt ? "read" : "sent",
      pending: it.pending,
    });
  });
  return rows;
}

function Ticks({ delivery }: { delivery: Delivery }) {
  if (delivery === "sending") return <span aria-label="Sending">🕓</span>;
  if (delivery === "failed") return null;
  return (
    <span aria-label={delivery === "read" ? "Read" : "Sent"} className={delivery === "read" ? "text-sky-700 dark:text-sky-300" : ""}>
      {delivery === "read" ? "✓✓" : "✓"}
    </span>
  );
}

function Bubble({ row, onRetry }: { row: Extract<Row, { kind: "msg" }>; onRetry: () => void }) {
  const { mine, groupStart, groupEnd } = row;
  const radius = mine
    ? `rounded-2xl ${groupStart ? "" : "rounded-tr-md"} ${groupEnd ? "" : "rounded-br-md"}`
    : `rounded-2xl ${groupStart ? "" : "rounded-tl-md"} ${groupEnd ? "" : "rounded-bl-md"}`;
  return (
    <div className={`flex px-3 ${mine ? "justify-end" : "justify-start"} ${groupEnd ? "pb-2" : "pb-0.5"}`}>
      <div className="flex max-w-[80%] flex-col items-end gap-1 md:max-w-[65%]">
        <div
          className={`${radius} px-3 py-1.5 ${
            mine
              ? "bg-brand text-brand-ink"
              : "bg-white text-stone-900 ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700"
          } ${row.delivery === "failed" ? "opacity-60" : ""}`}
        >
          <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
            {row.text}
            <span className="float-right ml-2 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none opacity-70">
              {clockTime(row.createdAt)}
              {row.delivery && <Ticks delivery={row.delivery} />}
            </span>
          </p>
        </div>
        {row.delivery === "failed" && (
          <button onClick={onRetry} className="text-xs font-medium text-red-600 dark:text-red-400">
            Not sent · Tap to retry
          </button>
        )}
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
    const list = useRef<VListHandle>(null);
    const atBottom = useRef(true);
    const initialScrollDone = useRef(false);

    const peerReadAt = useMemo(() => {
      const times = chat.members.filter((m) => m.user.id !== meId).map((m) => (m.lastReadAt ? Date.parse(m.lastReadAt) : 0));
      return times.length ? Math.min(...times) : 0;
    }, [chat.members, meId]);

    const ordered = useMemo(
      () => (messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse(),
      [messages.data],
    );
    const rows = useMemo(() => buildRows(ordered, pending, meId, peerReadAt), [ordered, pending, meId, peerReadAt]);

    const firstKey = useRef<string | undefined>(undefined);
    const shift = firstKey.current !== undefined && rows[0]?.key !== firstKey.current;
    const lastKey = useRef<string | undefined>(undefined);

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

    function onScroll(offset: number) {
      const h = list.current;
      if (!h) return;
      const wasAtBottom = atBottom.current;
      atBottom.current = offset + h.viewportSize >= h.scrollSize - 80;
      if (atBottom.current && !wasAtBottom) onSeen();
      if (offset < 300 && messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
    }

    if (messages.isPending) {
      return <div className="grid flex-1 place-items-center text-sm text-stone-500">Loading…</div>;
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end">
        {rows.length === 0 && (
          <p className="pb-6 text-center text-sm text-stone-500">No messages yet. Say hi 👋</p>
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
                onRetry={() => realtime && row.pending && void deliver(qc, realtime, row.pending)}
              />
            )
          }
        </VList>
      </div>
    );
  },
);
