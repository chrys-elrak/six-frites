"use client";

import type { GifDTO } from "@six/shared";
import { EmojiPicker } from "frimousse";
import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useT } from "@/lib/i18n";
import { GifPicker } from "./gif-picker";

type Tab = "emoji" | "gif";
const TABS: Tab[] = ["emoji", "gif"];

export function Emojis({ onPick }: { onPick: (emoji: string) => void }) {
  const tr = useT();
  const { locale } = useLocale();
  return (
    <EmojiPicker.Root
      locale={locale === "fr" ? "fr" : "en"}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      columns={8}
      className="isolate flex min-h-0 flex-1 flex-col"
    >
      <EmojiPicker.Search
        autoFocus={window.matchMedia("(pointer: fine)").matches}
        placeholder={tr.composer.searchEmoji}
        className="z-10 mx-2 mt-2 appearance-none rounded-lg bg-stone-100 px-3 py-2 text-[16px] outline-none focus:ring-2 focus:ring-brand md:text-sm dark:bg-stone-800"
      />
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 grid place-items-center text-sm text-stone-400">
          {tr.common.loading}
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 grid place-items-center text-sm text-stone-400">
          {tr.composer.noEmoji}
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

/** On wide screens with a `slot`, the picker docks there as a sidebar; otherwise it pops over the composer. */
export function EmojiButton({
  slot,
  onPick,
  onGif,
}: {
  slot?: HTMLElement | null;
  onPick: (emoji: string) => void;
  onGif: (gif: GifDTO) => void;
}) {
  const tr = useT();
  const [open, setOpen] = useState<false | "popover" | "docked">(false);
  const [tab, setTab] = useState<Tab>("emoji");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (open === "popover" && !root.current?.contains(target) && !target.closest?.("[role=dialog]")) setOpen(false);
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

  const panel = (
    <div
      className={
        open === "docked"
          ? "flex w-85 shrink-0 flex-col border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
          : "absolute bottom-12 left-0 z-40 flex h-[380px] w-[calc(100vw-1.5rem)] max-w-[340px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
      }
    >
      {tab === "emoji" ? (
        <Emojis onPick={onPick} />
      ) : (
        <GifPicker
          onPick={(gif) => {
            if (open === "popover") setOpen(false);
            onGif(gif);
          }}
        />
      )}
      <div role="tablist" className="flex shrink-0 border-t border-stone-200 dark:border-stone-800">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-sm font-medium ${
              tab === id ? "text-brand" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {tr.composer.pickerTabs[id]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          setOpen((v) => (v ? false : slot && window.matchMedia("(min-width: 1280px)").matches ? "docked" : "popover"))
        }
        aria-label={tr.composer.emojiGifsStickers}
        aria-expanded={!!open}
        className={`grid size-10 place-items-center rounded-full transition ${
          open ? "bg-brand/20 text-brand" : "text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
        }`}
      >
        <Smile className="size-5" />
      </button>

      {open === "popover" && panel}
      {open === "docked" && slot && createPortal(panel, slot)}
    </div>
  );
}
