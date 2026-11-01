"use client";

import { unwrap } from "@six/sdk";
import type { AdminAnonDTO } from "@six/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Avatar } from "../avatar";

function Person({ user }: { user: AdminAnonDTO["sender"] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar user={user} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {user.displayName}
          {user.bannedAt && <span className="ml-1.5 text-xs font-medium text-red-600">Banned</span>}
        </span>
        <span className="block truncate text-xs text-stone-500">{user.email}</span>
      </span>
    </span>
  );
}

/** Every anonymous message with who sent it to whom, including the ones either side hid. */
export function AnonMessages() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const anon = useInfiniteQuery({
    queryKey: adminKeys.anon(q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/admin/anon", { params: { query: { q: q || undefined, cursor: pageParam, limit: 30 } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = anon.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
        <Search className="size-4 text-stone-400" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Sender or recipient name or email"
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] outline-none md:text-sm"
        />
      </label>
      {anon.isSuccess && !items.length && <p className="py-8 text-center text-sm text-stone-500">No anonymous messages.</p>}
      {items.map((m) => (
        <article key={m.id} className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
          <div className="flex flex-wrap items-center gap-2">
            <Person user={m.sender} />
            <ArrowRight className="size-4 shrink-0 text-stone-400" />
            <Person user={m.recipient} />
            <span className="ml-auto text-xs text-stone-500">{timeAgo(m.createdAt)}</span>
          </div>
          {m.photoUrl && (
            <a href={m.photoUrl} target="_blank" rel="noreferrer">
              <img src={m.photoUrl} alt="" className="max-h-48 rounded-lg" />
            </a>
          )}
          {m.gifUrl && <video src={m.gifUrl} autoPlay loop muted playsInline aria-label="GIF" className="max-h-48 rounded-lg" />}
          {m.voiceUrl && <audio src={m.voiceUrl} controls preload="none" className="w-full max-w-sm" />}
          {m.text && <p className="text-sm break-words whitespace-pre-wrap">{m.text}</p>}
          {(m.senderDeletedAt || m.recipientDeletedAt) && (
            <p className="flex flex-wrap gap-1.5 text-xs">
              {m.senderDeletedAt && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-stone-800">Removed by sender</span>
              )}
              {m.recipientDeletedAt && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-stone-800">Hidden from recipient</span>
              )}
            </p>
          )}
        </article>
      ))}
      {anon.hasNextPage && (
        <button
          type="button"
          onClick={() => void anon.fetchNextPage()}
          disabled={anon.isFetchingNextPage}
          className="w-full rounded-xl p-3 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          Load more
        </button>
      )}
    </section>
  );
}
