"use client";

import { EmojiPicker } from "frimousse";
import { useLocale, useT } from "@/lib/i18n";

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
                className="bg-white/70 px-3 pt-3 pb-1.5 text-xs font-medium text-stone-500 backdrop-blur-xl dark:bg-stone-900/70"
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
              <button className="group grid h-9 w-[calc(100%/var(--frimousse-list-columns))] place-items-center" {...props}>
                <span className="grid size-9 place-items-center rounded-lg text-2xl group-data-[active]:bg-stone-100 dark:group-data-[active]:bg-stone-800">
                  {emoji.emoji}
                </span>
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
