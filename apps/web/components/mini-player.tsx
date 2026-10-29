"use client";

import { Pause, Play, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { pauseVoice, playVoice, stopVoice, useVoice } from "@/lib/playback";
import { SpeedButton } from "./attachment";

/**
 * The voice message still playing after you left its chat, with its controls; hidden while that chat is open.
 * `atTop` when nothing sits above it, so it clears the status bar itself. Signing out unmounts it and stops the sound.
 */
export function MiniPlayer({ atTop }: { atTop: boolean }) {
  const tr = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { track, playing, position, duration } = useVoice();
  useEffect(() => stopVoice, []);
  if (!track?.chatId || pathname === `/chats/${track.chatId}`) return null;
  const chatId = track.chatId;

  return (
    <div
      className={`relative flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white/90 px-2 py-1.5 backdrop-blur-xl dark:border-stone-800 dark:bg-stone-900/90 ${
        atTop ? "pt-[max(0.375rem,env(safe-area-inset-top))] md:pt-1.5" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => (playing ? pauseVoice() : void playVoice(track))}
        aria-label={playing ? tr.messages.pause : tr.messages.playVoice}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition active:scale-95"
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <button type="button" onClick={() => router.push(`/chats/${chatId}`)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{track.title}</span>
        <span className="block text-xs text-stone-500 tabular-nums dark:text-stone-400">
          {tr.summary.kinds.voice} · {formatDuration(position)}
          {duration > 0 && ` / ${formatDuration(duration)}`}
        </span>
      </button>
      <SpeedButton className="bg-brand/15 text-brand" />
      <button
        type="button"
        onClick={stopVoice}
        aria-label={tr.common.close}
        className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        <X className="size-4" />
      </button>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand transition-transform duration-200"
        style={{ transform: `scaleX(${duration ? position / duration : 0})` }}
      />
    </div>
  );
}
