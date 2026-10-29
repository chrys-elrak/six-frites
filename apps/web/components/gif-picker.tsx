"use client";

import { unwrap } from "@six/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
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
