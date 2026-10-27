"use client";

import { unwrap } from "@six/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pencil, Search, Share2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { AddContact } from "./add-contact";
import { Avatar } from "./avatar";
import { ContactEditor } from "./contact-editor";
import { NewInviteDialog } from "./invites";

export const contactKeys = { all: ["contacts"] as const, list: (q: string) => ["contacts", q] as const };

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ContactList() {
  const tr = useT();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);

  const contacts = useInfiniteQuery({
    queryKey: contactKeys.list(q),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/contacts", { params: { query: { q: q || undefined, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="space-y-3 border-b border-stone-200 px-4 pt-3 pb-3 dark:border-stone-800">
        <h1 className="text-xl font-semibold tracking-tight">{tr.common.contacts}</h1>
        <label className="flex items-center gap-2 rounded-xl bg-stone-200/70 px-3 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-800">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr.contacts.search}
            aria-label={tr.contacts.searchContacts}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-stone-900 outline-none placeholder:text-stone-500 md:text-sm dark:text-stone-100"
          />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-100 dark:hover:bg-stone-900"
        >
          <span className="grid size-11 place-items-center rounded-full bg-brand/15 text-brand">
            <UserPlus className="size-5" />
          </span>
          <span className="font-medium text-brand">{tr.contacts.addContact}</span>
        </button>
        <button
          onClick={() => setInviting(true)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-100 dark:hover:bg-stone-900"
        >
          <span className="grid size-11 place-items-center rounded-full bg-brand/15 text-brand">
            <Share2 className="size-5" />
          </span>
          <span className="font-medium text-brand">{tr.contacts.inviteFriend}</span>
        </button>
        {adding && <AddContact onClose={() => setAdding(false)} />}
        {inviting && <NewInviteDialog onClose={() => setInviting(false)} />}

        {contacts.isPending && <p className="p-4 text-sm text-stone-500">{tr.common.loading}</p>}
        {contacts.isError && <p className="p-4 text-sm text-red-600">{tr.contacts.loadFailed}</p>}
        {contacts.isSuccess && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-stone-500">
            <Users className="size-8 text-stone-400" strokeWidth={1.6} />
            {q ? tr.contacts.noMatch(q) : tr.contacts.empty}
          </div>
        )}

        {items.map((c) => (
          <div key={c.chatId} className="flex items-center hover:bg-stone-100 dark:hover:bg-stone-900">
            <Link
              href={`/chats/${c.chatId}`}
              className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 active:bg-stone-100 dark:active:bg-stone-900"
            >
              <Avatar user={c.user} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.user.displayName}</span>
              </span>
            </Link>
            <button
              onClick={() => setEditing(c.user.id)}
              aria-label={tr.contacts.editName(c.user.displayName)}
              className="mr-2 grid size-9 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        ))}

        {editing && <ContactEditor userId={editing} onClose={() => setEditing(null)} />}

        {contacts.hasNextPage && (
          <button
            onClick={() => contacts.fetchNextPage()}
            disabled={contacts.isFetchingNextPage}
            className="w-full p-3 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900"
          >
            {tr.common.loadMore}
          </button>
        )}
      </div>
    </div>
  );
}
