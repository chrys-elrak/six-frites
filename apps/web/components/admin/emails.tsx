"use client";

import { unwrap } from "@six/sdk";
import { type AdminMailDTO, MAIL_KINDS, MAIL_STATUSES } from "@six/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Segmented } from "./segmented";

type Kind = AdminMailDTO["kind"];
type Status = AdminMailDTO["status"];

const KIND_LABELS: Record<Kind, string> = { poke: "👋 Poke", inactive: "🍟 Gone quiet", anon: "🎭 Share your link" };
const STATUS_STYLES: Record<Status, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  skipped: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

/** Every email the app sent or tried to send: pokes, reminders and guest nudges, with what went wrong. */
export function Emails() {
  const [kind, setKind] = useState<Kind | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const stats = useQuery({
    queryKey: adminKeys.emailStats,
    queryFn: async () => unwrap(await six.api.GET("/v1/admin/emails/stats")),
  });
  const log = useInfiniteQuery({
    queryKey: adminKeys.emails(kind, status, q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await six.api.GET("/v1/admin/emails", {
          params: {
            query: {
              kind: kind === "all" ? undefined : kind,
              status: status === "all" ? undefined : status,
              q: q || undefined,
              cursor: pageParam,
              limit: 30,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {MAIL_STATUSES.map((s) => (
          <div key={s} className="rounded-2xl bg-surface backdrop-blur-md p-3 ring-1 ring-surface-line">
            <p className="text-2xl font-semibold tabular-nums">{stats.data?.[s] ?? "–"}</p>
            <p className="text-xs text-stone-500 capitalize">{s} today</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: "all" as const, label: "All" }, ...MAIL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))]}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[{ value: "all" as const, label: "Any" }, ...MAIL_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))]}
        />
      </div>
      <label className="flex items-center gap-2 rounded-xl bg-surface backdrop-blur-md px-3 ring-1 ring-surface-line">
        <Search className="size-4 text-stone-400" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Recipient name or email"
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] outline-none md:text-sm"
        />
      </label>
      {log.isSuccess && !items.length && <p className="py-8 text-center text-sm text-stone-500">No emails yet.</p>}
      {items.map((m) => (
        <article key={m.id} className="space-y-1.5 rounded-2xl bg-surface backdrop-blur-md p-4 ring-1 ring-surface-line">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium dark:bg-stone-800">{KIND_LABELS[m.kind]}</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${STATUS_STYLES[m.status]}`}>{m.status}</span>
            <span className="ml-auto text-stone-500" title={new Date(m.createdAt).toLocaleString()}>
              {timeAgo(m.createdAt)}
            </span>
          </div>
          <p className="font-medium break-words">{m.subject}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-stone-600 dark:text-stone-300">
            {m.sender && (
              <>
                <span className="font-medium">{m.sender.displayName}</span>
                <ArrowRight className="size-3.5 text-stone-400" />
              </>
            )}
            <span className="font-medium">{m.recipient?.displayName ?? "Deleted account"}</span>
            <span className="text-stone-500">{m.to}</span>
            {m.sentTo && <span className="text-xs text-stone-400">(went to {m.sentTo})</span>}
          </p>
          {m.error && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 font-mono text-xs break-words text-red-700 dark:bg-red-950/50 dark:text-red-300">{m.error}</p>}
        </article>
      ))}
      {log.hasNextPage && (
        <button
          type="button"
          onClick={() => void log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
          className="w-full rounded-xl p-3 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          Load more
        </button>
      )}
    </section>
  );
}
