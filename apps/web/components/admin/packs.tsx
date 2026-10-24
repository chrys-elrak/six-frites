"use client";

import { unwrap } from "@six/sdk";
import type { AdminStickerPackDTO } from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { adminKeys, refreshAdmin } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { six } from "@/lib/six";
import { addStickers } from "@/lib/stickers";
import { Dialog } from "../dialog";
import { UploadForm } from "../pack-dialog";
import { Sheet, type SheetAction } from "../sheet";
import { StickerView } from "../sticker";
import { Segmented } from "./segmented";

function PackCard({ pack }: { pack: AdminStickerPackDTO }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const live = !pack.bannedAt;

  async function takeDown(stickerId?: string) {
    unwrap(
      stickerId
        ? await six.api.DELETE("/v1/admin/stickers/{id}", { params: { path: { id: stickerId } } })
        : await six.api.DELETE("/v1/admin/sticker-packs/{id}", { params: { path: { id: pack.id } } }),
    );
    refreshAdmin(qc);
  }

  const packAction = pack.official
    ? { button: "Delete", title: `Delete "${pack.title}"?`, label: "Delete the official pack" }
    : { button: "Take down", title: `Take down "${pack.title}"?`, label: "Take down the whole pack" };
  const stickerAction = pack.official
    ? { title: "Remove this sticker?", label: "Remove it from the pack" }
    : { title: "Take this sticker down?", label: "Take down this sticker" };

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {pack.title}
            {!live && (
              <span className="ml-1.5 text-xs text-red-600 dark:text-red-400">
                {pack.official ? "Deleted" : "Taken down"}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-stone-500">
            {pack.official ? "Made by " : ""}
            {pack.owner ? `${pack.owner.displayName} · ${pack.owner.email}` : "Deleted account"} ·{" "}
            {timeAgo(pack.createdAt)} · {pack.stickers.length} sticker{pack.stickers.length === 1 ? "" : "s"}
          </p>
        </div>
        {live && (
          <button
            type="button"
            onClick={() =>
              setConfirm({
                title: packAction.title,
                actions: [{ label: packAction.label, destructive: true, onSelect: () => void takeDown() }],
              })
            }
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {packAction.button}
          </button>
        )}
      </header>
      {pack.stickers.length === 0 ? (
        <p className="text-sm text-stone-500">{live ? "No stickers yet." : "No stickers left."}</p>
      ) : (
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
          {pack.stickers.map((s) => (
            <div key={s.id} className="group relative grid place-items-center rounded-lg p-1">
              <StickerView sticker={s} size={56} still />
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: stickerAction.title,
                    actions: [{ label: stickerAction.label, destructive: true, onSelect: () => void takeDown(s.id) }],
                  })
                }
                aria-label={`Remove ${s.emoji} sticker`}
                className="absolute top-0 right-0 grid size-6 place-items-center rounded-full bg-stone-900/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {pack.official && live && (
        <div className="-mx-4 -mb-4 border-t border-stone-100 dark:border-stone-800">
          <UploadForm
            withTitle={false}
            label="Add stickers"
            onSubmit={async (_, files, emoji) => {
              await addStickers(qc, pack.id, files, emoji, true);
              refreshAdmin(qc);
            }}
          />
        </div>
      )}
      {confirm && <Sheet title={confirm.title} actions={confirm.actions} onClose={() => setConfirm(null)} />}
    </article>
  );
}

function NewOfficialPack({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  return (
    <Dialog onClose={onClose}>
      <div className="flex items-center border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <h2 className="flex-1 font-semibold">New official pack</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="px-4 pt-3 text-sm text-stone-500">Everyone gets official packs in their stickers right away.</p>
      <UploadForm
        withTitle
        label="Create"
        onSubmit={async (title, files, emoji) => {
          const pack = unwrap(await six.api.POST("/v1/admin/sticker-packs", { body: { title } }));
          if (files.length) await addStickers(qc, pack.id, files, emoji, true);
          refreshAdmin(qc);
          onClose();
        }}
      />
    </Dialog>
  );
}

export function Packs() {
  const [kind, setKind] = useState<"people" | "official">("people");
  const [creating, setCreating] = useState(false);
  const official = kind === "official";
  const packs = useInfiniteQuery({
    queryKey: adminKeys.packs(official),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await six.api.GET("/v1/admin/sticker-packs", {
          params: { query: { official: official ? "true" : "false", cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((pack) => pack.stickers.some((s) => !s.url))) ? 2000 : false,
  });
  const items = packs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "people", label: "People's packs" },
            { value: "official", label: "Official packs" },
          ]}
        />
        {official && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            <Plus className="size-4" /> New official pack
          </button>
        )}
      </div>
      <p className="text-sm text-stone-500">
        {official
          ? "Official packs are in everyone's stickers, next to the built-in ones. Removing a sticker keeps it in messages already sent."
          : "Taking a pack down hides it, stops its stickers being sent and blanks them in old messages."}
      </p>
      {packs.isPending ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-500">
          {official ? "No official packs yet." : "Nobody has made a sticker pack yet."}
        </p>
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
      {creating && <NewOfficialPack onClose={() => setCreating(false)} />}
    </div>
  );
}
