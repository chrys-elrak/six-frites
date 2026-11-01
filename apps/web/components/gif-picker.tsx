"use client";

import { SixApiError, unwrap } from "@six/sdk";
import type { GifDTO } from "@six/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";

/** GIPHY and KLIPY results for `q`, or trending ones when it is empty, a page at a time. */
export function useGifs(q: string, enabled = true, kind: "gif" | "sticker" = "gif") {
  return useInfiniteQuery({
    queryKey: ["gifs", kind, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, kind, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    enabled,
  });
}

/** A search box over GIPHY and KLIPY with a row of results, trending ones until something is typed. */
export function GifSearch({ onPick }: { onPick: (gif: GifDTO) => void }) {
  const tr = useT();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const gifs = useGifs(q);
  const items = gifs.data?.pages.flatMap((p) => p.items) ?? [];
  const notice =
    gifs.error instanceof SixApiError && gifs.error.code === "GIFS_UNAVAILABLE"
      ? tr.composer.gifsUnavailable
      : gifs.isError
        ? tr.composer.couldNotLoadGifs
        : !gifs.data
          ? tr.common.loading
          : items.length
            ? null
            : tr.composer.noGifs;

  return (
    <div className="space-y-2 px-3 pb-2">
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoFocus
        placeholder={tr.ask.searchGifs}
        aria-label={tr.ask.searchGifs}
        className="block w-full rounded-xl bg-stone-100 px-3 py-2 text-[16px] outline-none placeholder:text-stone-400 md:text-sm dark:bg-stone-800"
      />
      {notice ? (
        <p className="py-8 text-center text-sm text-stone-400">{notice}</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto overscroll-contain">
          {items.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(g)}
              title={g.title}
              className="h-24 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
              style={{ aspectRatio: `${g.width} / ${g.height}` }}
            >
              <img src={g.previewUrl} alt={g.title} draggable={false} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>
    </div>
  );
}
