"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { GifDTO } from "@six/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";

export function GifPicker({ onPick }: { onPick: (gif: GifDTO) => void }) {
  const tr = useT();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 400);
    return () => clearTimeout(t);
  }, [input]);

  const gifs = useInfiniteQuery({
    queryKey: ["gifs", q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const items = gifs.data?.pages.flatMap((p) => p.items) ?? [];
  const unavailable = gifs.error instanceof SixApiError && gifs.error.code === "GIFS_UNAVAILABLE";
  const notice = unavailable
    ? tr.composer.gifsUnavailable
    : gifs.isError
      ? tr.composer.couldNotLoadGifs
      : gifs.isPending
        ? tr.common.loading
        : items.length === 0
          ? tr.composer.noGifs
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="relative mx-2 mt-2 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus={window.matchMedia("(pointer: fine)").matches}
          placeholder={tr.composer.searchGiphy}
          aria-label={tr.composer.searchGifs}
          className="w-full appearance-none rounded-lg bg-stone-100 py-2 pr-3 pl-9 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-800"
        />
      </label>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && gifs.hasNextPage && !gifs.isFetchingNextPage) {
            void gifs.fetchNextPage();
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        {notice && <p className="py-8 text-center text-sm text-stone-400">{notice}</p>}
        <div className="columns-2 gap-1.5">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(g)}
              className="mb-1.5 block w-full overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
              style={{ aspectRatio: `${g.width} / ${g.height}` }}
            >
              <img
                src={g.previewUrl}
                alt={g.title}
                loading="lazy"
                draggable={false}
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
        {items.length > 0 && <p className="py-2 text-center text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>}
      </div>
    </div>
  );
}
