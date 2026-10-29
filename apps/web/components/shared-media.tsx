"use client";

import { unwrap } from "@six/sdk";
import { type ChatDTO, findInText, maskSpoilers, messageLinks, previewText } from "@six/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, MessageSquareText, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hydrateAll } from "@/lib/e2ee";
import { dayLabel, listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Segmented } from "./admin/segmented";
import { AlbumViewer, AttachmentView, type ShownAttachment } from "./attachment";
import { DateRangeDialog } from "./chat-menu";
import { Portal } from "./portal";

export type SharedTab = "search" | "media" | "files" | "links";
type Range = { from?: string; to?: string };

const ONLY = { search: "text", media: "media", files: "files", links: "links" } as const;

function useShared(chatId: string, tab: SharedTab, range: Range, enabled = true) {
  const only = ONLY[tab];
  return useInfiniteQuery({
    queryKey: ["shared", chatId, only, range.from ?? null, range.to ?? null],
    initialPageParam: undefined as string | undefined,
    enabled,
    queryFn: async ({ pageParam }) => {
      const page = unwrap(
        await six.api.GET("/v1/chats/{id}/messages", {
          params: {
            path: { id: chatId },
            query: { only, limit: tab === "media" || tab === "files" ? 60 : 100, cursor: pageParam, ...range },
          },
        }),
      );
      return { ...page, items: await hydrateAll(page.items) };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

type Shared = ReturnType<typeof useShared>;

/** Loads the next page whenever the end of the list scrolls into view, so a page with nothing to show loads the one after. */
function More({ query }: { query: Shared }) {
  const ref = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && void fetchNextPage());
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return <div ref={ref} className="h-px" />;
}

function Status({ query, empty, count }: { query: Shared; empty: string; count: number }) {
  const tr = useT();
  if (query.isPending || (count === 0 && query.hasNextPage)) {
    return <p className="p-8 text-center text-sm text-stone-500">{tr.common.loading}</p>;
  }
  if (query.isError) return <p className="p-8 text-center text-sm text-red-600">{query.error.message}</p>;
  return count === 0 ? <p className="p-8 text-center text-sm text-stone-500">{empty}</p> : null;
}

function Mine({ onPhoto = false }: { onPhoto?: boolean }) {
  const tr = useT();
  return (
    <span
      className={`pointer-events-none rounded-full px-1.5 py-px text-[10px] font-semibold ${
        onPhoto ? "absolute bottom-1 left-1 bg-black/55 text-white" : "bg-brand/15 text-brand"
      }`}
    >
      {tr.common.you}
    </span>
  );
}

function ShowInChat({ onClick }: { onClick: () => void }) {
  const tr = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tr.chat.showInChat}
      title={tr.chat.showInChat}
      className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
    >
      <MessageSquareText className="size-5" />
    </button>
  );
}

function Search({
  chat,
  range,
  searchFor,
  onJump,
}: {
  chat: ChatDTO;
  range: Range;
  searchFor: string;
  onJump: (id: string) => void;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const [input, setInput] = useState(searchFor);
  const [q, setQ] = useState(searchFor.trim());
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);
  const active = !!q || !!range.from;
  const query = useShared(chat.id, "search", range, active);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const names = new Map(chat.members.map((m) => [m.user.id, m.user.displayName]));
  const hits = items.flatMap((m) => {
    if (m.undecryptable) return [];
    if (!q) return [{ m, before: previewText(m, tr), match: "", after: "" }];
    const hit = findInText(m.spoiler && m.type === "text" ? "" : maskSpoilers(m.text ?? "", m.entities), q);
    return hit ? [{ m, ...hit }] : [];
  });
  const oldest = items.at(-1)?.createdAt;

  return (
    <>
      <div className="px-3 py-2">
        <label className="flex items-center gap-2 rounded-xl bg-stone-200/70 px-3 py-2 text-stone-500 focus-within:ring-2 focus-within:ring-brand dark:bg-stone-800">
          <SearchIcon className="size-4 shrink-0" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr.chat.searchMessages}
            aria-label={tr.chat.searchMessages}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-stone-900 outline-none placeholder:text-stone-500 md:text-sm dark:text-stone-100"
          />
        </label>
      </div>
      {!active ? (
        <p className="p-8 text-center text-sm text-stone-500">{tr.chat.searchHint}</p>
      ) : (
        <>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {hits.map((h) => (
              <li key={h.m.id}>
                <button
                  type="button"
                  onClick={() => onJump(h.m.id)}
                  className="block w-full px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-900"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {h.m.senderId === meId ? tr.common.you : (names.get(h.m.senderId) ?? tr.common.someone)}
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">{listTime(h.m.createdAt)}</span>
                  </span>
                  <span className="line-clamp-2 text-sm text-stone-600 dark:text-stone-300">
                    {h.before}
                    {h.match && <mark className="rounded bg-brand/30 text-inherit">{h.match}</mark>}
                    {h.after}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {query.hasNextPage && oldest && (
            <p className="px-4 py-2 text-center text-xs text-stone-500">{tr.chat.searchedBack(dayLabel(oldest))}</p>
          )}
          <Status query={query} empty={tr.chat.noResults} count={hits.length} />
          <More query={query} />
        </>
      )}
    </>
  );
}

function Media({
  chat,
  range,
  onView,
}: {
  chat: ChatDTO;
  range: Range;
  onView: (items: ShownAttachment[], ids: string[], start: number) => void;
}) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const query = useShared(chat.id, "media", range);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const media = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.attachment && !m.undecryptable);
  const shown: ShownAttachment[] = media.map((m) => ({ source: "server", data: m.attachment!, file: m.file }));

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4">
        {media.map((m, i) => {
          const safe = chat.safeView && m.senderId !== meId;
          return (
            <div key={m.id} className="relative aspect-square">
              <AttachmentView
                attachment={shown[i]!}
                mine={false}
                tile
                hidden={(m.spoiler || safe) && !revealed.has(m.id)}
                hiddenLabel={m.spoiler ? undefined : tr.messages.tapToShow}
                onReveal={() => setRevealed((s) => new Set(s).add(m.id))}
                onOpen={() =>
                  onView(
                    shown,
                    media.map((x) => x.id),
                    i,
                  )
                }
              />
              {m.senderId === meId && <Mine onPhoto />}
            </div>
          );
        })}
      </div>
      <Status query={query} empty={tr.chat.noMedia} count={media.length} />
      <More query={query} />
    </>
  );
}

function Files({ chatId, range, onJump }: { chatId: string; range: Range; onJump: (id: string) => void }) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const query = useShared(chatId, "files", range);
  const files = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.attachment && !m.undecryptable);

  return (
    <>
      <ul className="divide-y divide-stone-100 dark:divide-stone-800">
        {files.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
            <div className="min-w-0 flex-1">
              <AttachmentView
                attachment={{ source: "server", data: m.attachment!, file: m.file }}
                mine={false}
                onOpen={() => {}}
              />
            </div>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-stone-500">
              {listTime(m.createdAt)}
              {m.senderId === meId && <Mine />}
            </span>
            <ShowInChat onClick={() => onJump(m.id)} />
          </li>
        ))}
      </ul>
      <Status query={query} empty={tr.chat.noFiles} count={files.length} />
      <More query={query} />
    </>
  );
}

const host = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
};

function Links({ chatId, range, onJump }: { chatId: string; range: Range; onJump: (id: string) => void }) {
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const query = useShared(chatId, "links", range);
  const links = (query.data?.pages.flatMap((p) => p.items) ?? []).flatMap((m) =>
    messageLinks(m.text ?? "", m.entities).map((l, i) => ({
      ...l,
      key: `${m.id}:${i}`,
      id: m.id,
      at: m.createdAt,
      mine: m.senderId === meId,
    })),
  );

  return (
    <>
      <ul className="divide-y divide-stone-100 dark:divide-stone-800">
        {links.map((l) => (
          <li key={l.key} className="flex items-center pr-2">
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 hover:bg-stone-100 dark:hover:bg-stone-900"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand uppercase">
                {host(l.href)[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{host(l.href)}</span>
                <span className="block truncate text-xs text-brand">{l.text}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5 pr-1 text-xs text-stone-500">
                {listTime(l.at)}
                {l.mine && <Mine />}
              </span>
            </a>
            <ShowInChat onClick={() => onJump(l.id)} />
          </li>
        ))}
      </ul>
      <Status query={query} empty={tr.chat.noLinks} count={links.length} />
      <More query={query} />
    </>
  );
}

/** Searches a chat and lists its photos and videos, files and links, newest first, like Telegram does. */
export function SharedMedia({
  chat,
  initial,
  query = "",
  onJump,
  onClose,
}: {
  chat: ChatDTO;
  initial: SharedTab;
  /** What to search for when it opens on the search tab. */
  query?: string;
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [tab, setTab] = useState(initial);
  const [range, setRange] = useState<Range>({});
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<{ items: ShownAttachment[]; ids: string[]; start: number } | null>(null);

  useEffect(() => {
    if (viewer || picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, picking, onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-40 flex justify-center bg-black/40 md:items-center md:p-6"
        role="dialog"
        aria-modal
        aria-label={tab === "search" ? tr.chat.search : tr.chat.sharedMedia}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="flex size-full flex-col overflow-hidden bg-stone-50 md:h-[min(46rem,100%)] md:max-w-2xl md:rounded-2xl md:shadow-xl dark:bg-stone-950">
          <header className="flex items-center gap-2 border-b border-stone-200 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:pt-2 dark:border-stone-800">
            <button
              onClick={onClose}
              aria-label={tr.common.close}
              className="grid size-10 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <X className="size-5" />
            </button>
            <h2 className="min-w-0 flex-1 truncate font-semibold">{chat.title}</h2>
            <button
              onClick={() => setPicking(true)}
              aria-label={tr.chat.filterDates}
              title={tr.chat.filterDates}
              className={`grid size-10 place-items-center rounded-full hover:bg-stone-200 dark:hover:bg-stone-800 ${
                range.from ? "text-brand" : "text-stone-600 dark:text-stone-300"
              }`}
            >
              <CalendarDays className="size-5" />
            </button>
          </header>
          <div className="flex flex-col items-center gap-2 p-2">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "search", label: tr.chat.search },
                { value: "media", label: tr.chat.media },
                { value: "files", label: tr.chat.files },
                { value: "links", label: tr.chat.links },
              ]}
            />
            {range.from && range.to && (
              <button
                onClick={() => setRange({})}
                aria-label={tr.chat.clearDates}
                className="flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
              >
                {dayLabel(range.from)} – {dayLabel(range.to)}
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
            {tab === "search" && <Search chat={chat} range={range} searchFor={query} onJump={onJump} />}
            {tab === "media" && (
              <Media chat={chat} range={range} onView={(items, ids, start) => setViewer({ items, ids, start })} />
            )}
            {tab === "files" && <Files chatId={chat.id} range={range} onJump={onJump} />}
            {tab === "links" && <Links chatId={chat.id} range={range} onJump={onJump} />}
          </div>
        </div>
      </div>
      {viewer && (
        <AlbumViewer
          items={viewer.items}
          start={viewer.start}
          onClose={() => setViewer(null)}
          onShow={(i) => onJump(viewer.ids[i]!)}
        />
      )}
      {picking && (
        <DateRangeDialog
          title={tr.chat.whichDays}
          onPick={(r) => {
            setRange(r);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Portal>
  );
}
