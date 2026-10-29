"use client";

import { cutStart, videoCuts } from "@six/shared";
import { Check, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";

const MIN_SECONDS = 0.5;
const round = "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95";
const handle =
  "pointer-events-none absolute inset-0 size-full appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-brand focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-white";

/** Picks the part of a video to send. The start snaps to keyframes, since the cut is made without re-encoding. */
export function VideoTrimmer({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (from: number, to: number) => void;
}) {
  const tr = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [cuts, setCuts] = useState<ReturnType<typeof videoCuts> | undefined>(undefined);
  const [[from, to], setRange] = useState<[number, number]>([0, 0]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  useEffect(() => {
    let live = true;
    void file.arrayBuffer().then((buffer) => {
      if (!live) return;
      const found = videoCuts(new Uint8Array(buffer));
      setCuts(found);
      if (found) setRange([0, found.duration]);
    });
    return () => {
      live = false;
    };
  }, [file]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!v.paused) return v.pause();
    if (v.currentTime < from || v.currentTime >= to - 0.05) v.currentTime = from;
    void v.play();
  };
  const length = cuts?.duration ?? 1;
  const changed = !!cuts && (from > 0.01 || to < cuts.duration - 0.01);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal aria-label={tr.composer.cutVideo}>
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} aria-label={tr.common.cancel} className={`${round} hover:bg-white/10`}>
          <X className="size-6" />
        </button>
        <h2 className="flex-1 text-center font-semibold">{tr.composer.cutVideo}</h2>
        <button
          type="button"
          onClick={() => (changed ? onDone(from, to) : onCancel())}
          disabled={!cuts}
          aria-label={tr.composer.cut}
          className={`${round} bg-brand text-brand-ink disabled:opacity-40`}
        >
          <Check className="size-6" strokeWidth={2.6} />
        </button>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? tr.messages.pause : tr.composer.play}
        className="relative flex min-h-0 flex-1 items-center justify-center p-3"
      >
        <video
          ref={video}
          src={url}
          playsInline
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.paused || v.currentTime < to) return;
            v.pause();
            v.currentTime = from;
          }}
          className="max-h-full max-w-full rounded-lg"
        />
        {!playing && (
          <span className="absolute grid size-16 place-items-center rounded-full bg-black/50 backdrop-blur">
            <Play className="size-7 fill-white" />
          </span>
        )}
      </button>
      <div className="space-y-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {cuts === null ? (
          <p role="alert" className="py-4 text-center text-sm text-red-400">
            {tr.composer.cantCut}
          </p>
        ) : (
          cuts && (
            <>
              <div className="relative mx-auto h-10 max-w-xl rounded-md bg-white/15">
                <div
                  className="absolute inset-y-0 rounded-md bg-brand/35"
                  style={{ left: `${(from / length) * 100}%`, right: `${100 - (to / length) * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={length}
                  step={0.01}
                  value={from}
                  onChange={(e) => {
                    const start = cutStart(cuts.keyframes, Math.min(+e.target.value, to - MIN_SECONDS));
                    setRange([start, to]);
                    seek(start);
                  }}
                  aria-label={tr.composer.cutStart}
                  aria-valuetext={formatDuration(from * 1000)}
                  className={`${handle} ${from > length / 2 ? "z-10" : ""}`}
                />
                <input
                  type="range"
                  min={0}
                  max={length}
                  step={0.01}
                  value={to}
                  onChange={(e) => {
                    const end = Math.min(length, Math.max(+e.target.value, from + MIN_SECONDS));
                    setRange([from, end]);
                    seek(end);
                  }}
                  aria-label={tr.composer.cutEnd}
                  aria-valuetext={formatDuration(to * 1000)}
                  className={handle}
                />
              </div>
              <p className="mx-auto flex max-w-xl justify-between text-xs text-white/70 tabular-nums">
                <span>{formatDuration(from * 1000)}</span>
                <span className="font-semibold text-white">{formatDuration((to - from) * 1000)}</span>
                <span>{formatDuration(to * 1000)}</span>
              </p>
              <p className="text-center text-xs text-white/50">{tr.composer.cutHint}</p>
            </>
          )
        )}
      </div>
    </div>
  );
}
