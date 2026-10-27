"use client";

import { ChevronUp, Lock, Mic, SendHorizontal, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const HOLD_MS = 250;
const LOCK_PX = 70;
const CANCEL_PX = 110;

export type RecordMode = "voice" | "video";

/**
 * The mic / camera button. A tap switches between voice and video, holding records. While holding,
 * sliding up locks the recording hands-free and sliding left cancels it; letting go sends it. Once
 * locked it becomes the send button. Activating it from the keyboard starts a locked recording.
 */
export function RecordButton({
  mode,
  state,
  disabled,
  onToggle,
  onStart,
  onLock,
  onRelease,
  onCancel,
  onSend,
  onSlide,
}: {
  mode: RecordMode;
  state: "idle" | "holding" | "locked";
  disabled?: boolean;
  onToggle: () => void;
  onStart: (locked: boolean) => void;
  onLock: () => void;
  onRelease: () => void;
  onCancel: () => void;
  onSend: () => void;
  onSlide: (dx: number) => void;
}) {
  const tr = useT();
  const press = useRef<{ timer: number; x: number; y: number; held: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [hint, setHint] = useState(false);
  const live = useRef(state);
  live.current = state;

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(t);
  }, [hint, mode]);

  function down(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || live.current !== "idle") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = {
      x: e.clientX,
      y: e.clientY,
      held: false,
      timer: window.setTimeout(() => {
        p.held = true;
        setHint(false);
        onStart(false);
      }, HOLD_MS),
    };
    press.current = p;
  }

  function move(e: React.PointerEvent) {
    const p = press.current;
    if (!p?.held || live.current !== "holding") return;
    const dx = Math.min(0, e.clientX - p.x);
    onSlide(dx);
    if (e.clientY - p.y <= -LOCK_PX) onLock();
    else if (dx <= -CANCEL_PX) {
      press.current = null;
      onCancel();
    }
  }

  function up() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    swallowClick.current = true;
    if (!p.held) {
      onToggle();
      setHint(true);
    } else if (live.current === "holding") onRelease();
  }

  function cancel() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.held && live.current === "holding") onCancel();
  }

  function click(e: React.MouseEvent) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (live.current === "locked") onSend();
    else if (live.current === "idle" && e.detail === 0) onStart(true);
  }

  const label =
    state === "locked"
      ? mode === "voice"
        ? tr.composer.sendVoice
        : tr.composer.sendVideoNote
      : mode === "voice"
        ? tr.composer.recordVoice
        : tr.composer.recordVideoNote;

  return (
    <span className="relative shrink-0">
      {state === "holding" && (
        <span
          title={tr.composer.slideUpToLock}
          className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-full bg-white px-2 py-2 text-stone-500 shadow ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800"
        >
          <Lock className="size-4" />
          <ChevronUp className="size-4 animate-bounce" />
        </span>
      )}
      {hint && state === "idle" && (
        <span
          role="status"
          className="absolute right-0 bottom-full mb-2 w-56 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-stone-100 dark:text-stone-900"
        >
          {mode === "voice" ? tr.composer.holdForVoice : tr.composer.holdForVideo}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        title={state === "idle" ? (mode === "voice" ? tr.composer.holdForVoice : tr.composer.holdForVideo) : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onClick={click}
        onContextMenu={(e) => e.preventDefault()}
        className={`grid size-10 touch-none place-items-center rounded-full bg-brand text-brand-ink transition select-none [-webkit-touch-callout:none] disabled:opacity-40 ${
          state === "holding" ? "scale-125" : "active:scale-95"
        }`}
      >
        {state === "locked" ? (
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
