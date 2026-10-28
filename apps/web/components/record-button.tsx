"use client";

import { Mic, SendHorizontal, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/long-press";

export type RecordMode = "voice" | "video";

/**
 * The mic / camera button. A tap starts recording and turns it into the send button. A long press or
 * right click switches between voice and video.
 */
export function RecordButton({
  mode,
  active,
  disabled,
  onToggle,
  onStart,
  onSend,
}: {
  mode: RecordMode;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onStart: () => void;
  onSend: () => void;
}) {
  const tr = useT();
  const [hint, setHint] = useState(false);
  const press = useLongPress(() => {
    if (active) return;
    onToggle();
    setHint(true);
  });

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(t);
  }, [hint, mode]);

  const tapHint = mode === "voice" ? tr.composer.tapForVoice : tr.composer.tapForVideo;
  const label = active
    ? mode === "voice"
      ? tr.composer.sendVoice
      : tr.composer.sendVideoNote
    : mode === "voice"
      ? tr.composer.recordVoice
      : tr.composer.recordVideoNote;

  return (
    <span className="relative shrink-0">
      {hint && !active && (
        <span
          role="status"
          className="absolute right-0 bottom-full mb-2 w-56 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-stone-100 dark:text-stone-900"
        >
          {tapHint}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        title={active ? undefined : tapHint}
        {...press}
        onClick={() => {
          setHint(false);
          if (active) onSend();
          else onStart();
        }}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition select-none [-webkit-touch-callout:none] active:scale-95 disabled:opacity-40"
      >
        {active ? (
          <SendHorizontal className="size-5" strokeWidth={2.2} aria-hidden />
        ) : mode === "voice" ? (
          <Mic className="size-5" />
        ) : (
          <Video className="size-5" />
        )}
      </button>
    </span>
  );
}
