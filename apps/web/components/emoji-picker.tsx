"use client";

import { EmojiPicker } from "frimousse";
import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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
        aria-label="Emoji"
        aria-expanded={open}
        className={`grid size-10 place-items-center rounded-full transition ${
          open ? "bg-brand/20 text-brand" : "text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
        }`}
      >
        <Smile className="size-5" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-40 overflow-hidden rounded-2xl shadow-xl ring-1 ring-stone-200 dark:ring-stone-800">
          <EmojiPicker.Root
            onEmojiSelect={({ emoji }) => onPick(emoji)}
            columns={8}
            className="isolate flex h-[340px] w-[calc(100vw-1.5rem)] max-w-[320px] flex-col bg-white dark:bg-stone-900"
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
        </div>
      )}
    </div>
  );
}
