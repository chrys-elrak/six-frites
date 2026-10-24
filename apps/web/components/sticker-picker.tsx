"use client";

import type { StickerDTO } from "@six/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useStickerPacks } from "@/lib/stickers";
import { NewPackDialog, PackDialog } from "./pack-dialog";
import { StickerView } from "./sticker";

export function StickerPicker({ onPick }: { onPick: (sticker: StickerDTO) => void }) {
  const packs = useStickerPacks();
  const [active, setActive] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = packs.data ?? [];
  const pack = list.find((p) => p.id === active) ?? list[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200 px-2 py-1.5 dark:border-stone-800">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            aria-label={p.title}
            aria-pressed={p.id === pack?.id}
            title={p.title}
            className={`grid size-10 shrink-0 place-items-center rounded-lg ${
              p.id === pack?.id ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            {p.stickers[0] ? (
              <StickerView sticker={p.stickers[0]} size={28} still />
            ) : (
              <span className="text-sm font-semibold">{p.title.slice(0, 1)}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New sticker pack"
          title="New sticker pack"
          className="grid size-10 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {pack && (
        <div className="flex items-center gap-2 px-3 pt-2 text-xs font-medium text-stone-500">
          <span className="min-w-0 flex-1 truncate">{pack.title}</span>
          {!pack.builtin && (
            <button type="button" onClick={() => setManaging(pack.id)} className="hover:underline">
              {pack.mine ? "Edit" : "Manage"}
            </button>
          )}
        </div>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-1 overflow-y-auto overscroll-contain p-2">
        {packs.isPending && <p className="col-span-4 py-8 text-center text-sm text-stone-400">Loading…</p>}
        {pack?.stickers.length === 0 && (
          <p className="col-span-4 py-8 text-center text-sm text-stone-400">No stickers in this pack yet.</p>
        )}
        {pack?.stickers.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            disabled={!s.url}
            className="grid place-items-center rounded-lg p-1 hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-stone-800"
          >
            <StickerView sticker={s} size={64} still />
          </button>
        ))}
      </div>
      {creating && (
        <NewPackDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setActive(id);
          }}
        />
      )}
      {managing && <PackDialog packId={managing} onClose={() => setManaging(null)} />}
    </div>
  );
}
