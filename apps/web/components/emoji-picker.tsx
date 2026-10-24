"use client";

import type { GifDTO, StickerDTO } from "@six/shared";
import { EmojiPicker } from "frimousse";
import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GifPicker } from "./gif-picker";
import { StickerPicker } from "./sticker-picker";

type Tab = "emoji" | "gif" | "sticker";
const TABS: { id: Tab; label: string }[] = [
  { id: "emoji", label: "Emoji" },
  { id: "gif", label: "GIFs" },
  { id: "sticker", label: "Stickers" },
];

export function Emojis({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker.Root
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      columns={8}
      className="isolate flex min-h-0 flex-1 flex-col"
    >
      <EmojiPicker.Search
        autoFocus={window.matchMedia("(pointer: fine)").matches}
        placeholder="Search emoji"
        className="z-10 mx-2 mt-2 appearance-none rounded-lg bg-stone-100 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-800"
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 grid place-items-center text-sm text-stone-400">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 grid place-items-center text-sm text-stone-400">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-white px-3 pt-3 pb-1.5 text-xs font-medium text-stone-500 dark:bg-stone-900"
                {...props}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="grid size-9 place-items-center rounded-lg text-2xl data-[active]:bg-stone-100 dark:data-[active]:bg-stone-800"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}

export function EmojiButton({
  onPick,
  onGif,
  onSticker,
}: {
  onPick: (emoji: string) => void;
  onGif: (gif: GifDTO) => void;
  onSticker: (sticker: StickerDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("emoji");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!root.current?.contains(target) && !target.closest?.("[role=dialog]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !document.querySelector("[role=dialog]") && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        aria-label="Emoji, GIFs and stickers"
        aria-expanded={open}
        className={`grid size-10 place-items-center rounded-full transition ${
          open ? "bg-brand/20 text-brand" : "text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
        }`}
      >
        <Smile className="size-5" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-40 flex h-[380px] w-[calc(100vw-1.5rem)] max-w-[340px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
          {tab === "emoji" ? (
            <Emojis onPick={onPick} />
          ) : tab === "gif" ? (
            <GifPicker
              onPick={(gif) => {
                setOpen(false);
                onGif(gif);
              }}
            />
          ) : (
            <StickerPicker
              onPick={(sticker) => {
                setOpen(false);
                onSticker(sticker);
              }}
            />
          )}
          <div role="tablist" className="flex shrink-0 border-t border-stone-200 dark:border-stone-800">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-2 text-sm font-medium ${
                  tab === t.id ? "text-brand" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
