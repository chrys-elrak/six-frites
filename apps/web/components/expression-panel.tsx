"use client";

import { unwrap } from "@six/sdk";
import type { GifDTO, StickerDTO } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Smile, Sticker, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { useIsAdmin } from "@/lib/admin";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { addStickers, createStickerPack, useStickerPacks } from "@/lib/stickers";
import { Emojis } from "./emoji-picker";
import { useGifs } from "./gif-picker";
import { PackDialog, UploadForm } from "./pack-dialog";
import { StickerView } from "./sticker";

type Tab = "emoji" | "sticker" | "gif";

const search = "block w-full rounded-xl bg-black/5 px-3 py-2 text-[16px] outline-none placeholder:text-stone-400 md:text-sm dark:bg-white/10";

function useDebounced(value: string) {
  const [q, setQ] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 300);
    return () => clearTimeout(t);
  }, [value]);
  return q;
}

/** Fetches the next page once the list is scrolled near its end. */
function loadMore(el: HTMLElement, query: ReturnType<typeof useGifs>) {
  if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
}

/** Keeps the search field's focus, so the keyboard stays up and the grid doesn't move under the finger. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function FoundGrid({ items, onPick, sticker }: { items: GifDTO[]; onPick: (g: GifDTO) => void; sticker?: boolean }) {
  return (
    <>
      {items.map((g) => (
        <button
          key={g.id}
          type="button"
          onMouseDown={keepFocus}
          onClick={() => onPick(g)}
          title={g.title}
          className={`aspect-square overflow-hidden rounded-lg ${sticker ? "" : "bg-stone-100 dark:bg-stone-800"}`}
        >
          <img src={g.previewUrl} alt={g.title} loading="lazy" draggable={false} className={`size-full ${sticker ? "object-contain" : "object-cover"}`} />
        </button>
      ))}
    </>
  );
}

function Stickers({ onSticker, onSearching }: { onSticker: (s: StickerDTO) => void; onSearching: (on: boolean) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const q = useDebounced(input);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const packs = useStickerPacks(!q);
  const admin = !!useIsAdmin().data;
  const own = useQuery({
    queryKey: ["sticker-search", q],
    queryFn: async () => unwrap(await six.api.GET("/v1/stickers/search", { params: { query: { q } } })).items,
    enabled: !!q,
    staleTime: 60_000,
  });
  const tile = "grid aspect-square place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10";
  const field = (
    <div className="p-2">
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => onSearching(true)}
        onBlur={() => onSearching(false)}
        placeholder={tr.composer.searchStickers}
        className={search}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {field}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        {q ? (
          <div className="grid grid-cols-4 gap-1">
            {own.data?.map((s) => (
              <button key={s.id} type="button" onClick={() => onSticker(s)} className={tile}>
                <StickerView sticker={s} size={72} still />
              </button>
            ))}
            {own.data?.length === 0 && <p className="col-span-4 py-8 text-center text-sm text-stone-400">{tr.composer.noStickersFound}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {admin && (
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => setCreating(true)}
                aria-label={tr.composer.newPack}
                className={`${tile} bg-stone-100 text-stone-500 dark:bg-stone-800`}
              >
                <Plus className="size-7" />
              </button>
            </div>
            )}
            {packs.data?.map((p) => (
              <section key={p.id}>
                <button type="button" onClick={() => setOpen(p.id)} className="px-1 pb-1 text-xs font-medium text-stone-500 hover:underline">
                  {p.title}
                </button>
                <div className="grid grid-cols-4 gap-1">
                  {p.stickers.map((s) => (
                    <button key={s.id} type="button" onClick={() => onSticker(s)} className={tile}>
                      <StickerView sticker={s} size={72} still />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      {creating && (
        <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto rounded-2xl bg-white dark:bg-stone-900">
          <div className="flex items-center justify-between px-4 pt-3">
            <h3 className="font-semibold">{tr.composer.newPack}</h3>
            <button type="button" onClick={() => setCreating(false)} aria-label={tr.common.close} className="grid size-8 place-items-center rounded-full hover:bg-black/5">
              <X className="size-4" />
            </button>
          </div>
          <UploadForm
            withTitle
            label={tr.composer.createPack}
            onSubmit={async (title, files, emoji) => {
              const pack = await createStickerPack(qc, title);
              if (files.length) await addStickers(qc, pack.id, files, emoji);
              setCreating(false);
              setOpen(pack.id);
            }}
          />
        </div>
      )}
      {open && (
        <PackDialog
          packId={open}
          onClose={() => setOpen(null)}
          onSend={(s) => {
            setOpen(null);
            onSticker(s);
          }}
        />
      )}
    </div>
  );
}

/** GIPHY and KLIPY: GIFs, or their stickers, which go out like a picture and aren't one of our stickers. */
function Gifs({
  onGif,
  onSticker,
  onSearching,
  compact,
}: {
  onGif: (g: GifDTO) => void;
  onSticker: (g: GifDTO) => void;
  onSearching: (on: boolean) => void;
  compact: boolean;
}) {
  const tr = useT();
  const [input, setInput] = useState("");
  const [kind, setKind] = useState<"gif" | "sticker">("gif");
  const q = useDebounced(input);
  const gifs = useGifs(q, true, kind);
  const items = gifs.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-2">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => onSearching(true)}
          onBlur={() => onSearching(false)}
          placeholder={tr.ask.searchGifs}
          className={`${search} min-w-0 flex-1`}
        />
        <div className="flex shrink-0 rounded-full bg-stone-100 p-0.5 text-xs font-medium dark:bg-stone-800">
          {(["gif", "sticker"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-full px-2.5 py-1 ${kind === k ? "bg-white text-brand shadow-sm dark:bg-stone-700" : "text-stone-500"}`}
            >
              {k === "gif" ? "Giphy" : "Klipy"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
        onScroll={(e) => loadMore(e.currentTarget, gifs)}
      >
        {gifs.isPending ? (
          <p className="py-8 text-center text-sm text-stone-400">{tr.common.loading}</p>
        ) : gifs.isError ? (
          <p className="py-8 text-center text-sm text-stone-400">{tr.composer.couldNotLoadGifs}</p>
        ) : (
          <div className={`grid gap-1 ${kind === "gif" ? "grid-cols-3" : "grid-cols-4"}`}>
            <FoundGrid items={items} onPick={kind === "gif" ? onGif : onSticker} sticker={kind === "sticker"} />
          </div>
        )}
      </div>
      {!compact && <p className="px-3 py-1 text-[11px] text-stone-400">{tr.composer.poweredByGiphy}</p>}
    </div>
  );
}

/** Emoji, stickers and GIFs to pick from, in tabs: docked under the composer on a phone, a window above it otherwise. */
export function ExpressionPanel({
  onEmoji,
  onSticker,
  onFoundSticker,
  onGif,
  onClose,
  place,
}: {
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerDTO) => void;
  onFoundSticker: (sticker: GifDTO) => void;
  onGif: (gif: GifDTO) => void;
  onClose: () => void;
  /** `docked` at the bottom of the screen, where a phone's keyboard would be; `popover` above the message box; `side` as a sidebar beside the chat. */
  place: "docked" | "popover" | "side";
}) {
  const tr = useT();
  const [picked, setPicked] = useState<Tab>("emoji");
  const [searching, setSearching] = useState(false);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const compact = searching && touch && place === "docked";
  const admin = !!useIsAdmin().data;
  const hasStickers = admin || !!useStickerPacks().data?.some((p) => p.stickers.length > 0);
  const tab = picked === "sticker" && !hasStickers ? "emoji" : picked;
  const setTab = setPicked;
  useCloseOnBack(onClose);
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "emoji", label: tr.composer.pickerTabs.emoji, icon: <Smile className="size-5" /> },
    ...(hasStickers ? [{ id: "sticker" as const, label: tr.composer.pickerTabs.sticker, icon: <Sticker className="size-5" /> }] : []),
    { id: "gif", label: tr.composer.pickerTabs.gif, icon: <span className="text-xs font-bold">GIF</span> },
  ];

  return (
    <div
      role="dialog"
      aria-label={tr.composer.expressions}
      className={
        place === "docked"
          ? `relative flex h-[min(22rem,45dvh)] shrink-0 flex-col border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-stone-800 dark:bg-stone-900`
          : place === "side"
            ? "relative z-10 flex w-96 shrink-0 flex-col border-l border-black/5 bg-stone-50/45 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-stone-950/40"
            : "absolute right-0 bottom-full z-30 mb-2 flex h-[min(26rem,60dvh)] w-96 flex-col overflow-hidden rounded-2xl bg-white/90 shadow-lg ring-1 ring-stone-200 backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-900/90 dark:ring-stone-800"
      }
    >
      <div role="tablist" hidden={compact} className="mx-auto flex w-full max-w-md shrink-0 items-center gap-1 p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(t.id)}
            className={`grid h-9 flex-1 place-items-center rounded-full ${tab === t.id ? "bg-brand/20 text-brand" : "text-stone-500 hover:bg-black/5 dark:hover:bg-white/10"}`}
          >
            {t.icon}
          </button>
        ))}
        {place === "side" && (
          <button
            type="button"
            onClick={onClose}
            aria-label={tr.common.close}
            title={tr.common.close}
            className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      {tab === "emoji" && <Emojis onPick={onEmoji} onSearching={setSearching} compact={compact} />}
      {tab === "sticker" && <Stickers onSticker={onSticker} onSearching={setSearching} />}
      {tab === "gif" && <Gifs onGif={onGif} onSticker={onFoundSticker} onSearching={setSearching} compact={compact} />}
    </div>
  );
}
