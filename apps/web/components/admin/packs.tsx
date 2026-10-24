"use client";

import { unwrap } from "@six/sdk";
import type { AdminStickerPackDTO } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { adminKeys, refreshAdmin } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { Sheet, type SheetAction } from "../sheet";
import { StickerView } from "../sticker";

function PackCard({ pack }: { pack: AdminStickerPackDTO }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{ title: string; actions: SheetAction[] } | null>(null);

  async function takeDown(stickerId?: string) {
    unwrap(
      stickerId
        ? await six.api.DELETE("/v1/admin/stickers/{id}", { params: { path: { id: stickerId } } })
        : await six.api.DELETE("/v1/admin/sticker-packs/{id}", { params: { path: { id: pack.id } } }),
    );
    refreshAdmin(qc);
  }

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {pack.title}
            {pack.bannedAt && <span className="ml-1.5 text-xs text-red-600 dark:text-red-400">Taken down</span>}
          </p>
          <p className="truncate text-xs text-stone-500">
            {pack.owner ? `${pack.owner.displayName} · ${pack.owner.email}` : "Deleted account"} ·{" "}
            {timeAgo(pack.createdAt)}
          </p>
        </div>
        {!pack.bannedAt && (
          <button
            type="button"
            onClick={() =>
              setConfirm({
                title: `Take down "${pack.title}"?`,
                actions: [{ label: "Take down the whole pack", destructive: true, onSelect: () => void takeDown() }],
              })
            }
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Take down
          </button>
        )}
      </header>
      {pack.stickers.length === 0 ? (
        <p className="text-sm text-stone-500">{pack.bannedAt ? "No stickers left." : "Empty pack."}</p>
      ) : (
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
          {pack.stickers.map((s) => (
            <div key={s.id} className="group relative grid place-items-center rounded-lg p-1">
              <StickerView sticker={s} size={56} still />
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: "Take this sticker down?",
                    actions: [
                      { label: "Take down this sticker", destructive: true, onSelect: () => void takeDown(s.id) },
                    ],
                  })
                }
                aria-label={`Take down ${s.emoji} sticker`}
                className="absolute top-0 right-0 grid size-6 place-items-center rounded-full bg-stone-900/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {confirm && <Sheet title={confirm.title} actions={confirm.actions} onClose={() => setConfirm(null)} />}
    </article>
  );
}

export function Packs() {
  const packs = useInfiniteQuery({
    queryKey: adminKeys.packs,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/admin/sticker-packs", { params: { query: { cursor: pageParam, limit: 20 } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = packs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Packs people made. Taking one down hides it, stops its stickers being sent and blanks them in old messages.
      </p>
      {packs.isPending ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-500">Nobody has made a sticker pack yet.</p>
      ) : (
        items.map((p) => <PackCard key={p.id} pack={p} />)
      )}
      {packs.hasNextPage && (
        <button
          type="button"
          onClick={() => void packs.fetchNextPage()}
          disabled={packs.isFetchingNextPage}
          className="w-full rounded-xl py-2.5 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-100 dark:ring-stone-800 dark:hover:bg-stone-900"
        >
          {packs.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
