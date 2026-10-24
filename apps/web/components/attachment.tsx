"use client";

import type { AttachmentDTO } from "@six/shared";
import { AlertCircle, Download, EyeOff, FileText, Loader2, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBytes, formatDuration } from "@/lib/format";
import type { PendingAttachment } from "@/lib/outbox";
import { usePlaybackRate } from "@/lib/playback";
import { Portal } from "./portal";

export type ShownAttachment =
  | { source: "server"; data: AttachmentDTO }
  | { source: "local"; data: PendingAttachment; failed: boolean };

export interface LightboxItem {
  kind: "image" | "video";
  url: string;
  poster: string | null;
  name: string;
}

function view(a: ShownAttachment) {
  if (a.source === "local") {
    const d = a.data;
    return {
      kind: d.kind,
      name: d.name,
      size: d.size,
      url: d.localUrl,
      thumbUrl: d.kind === "image" ? d.localUrl : null,
      width: d.width,
      height: d.height,
      durationMs: null as number | null,
      waveform: null as number[] | null,
      state: a.failed ? ("failed" as const) : d.progress < 1 ? ("uploading" as const) : ("processing" as const),
      progress: d.progress,
    };
  }
  const d = a.data;
  return {
    kind: d.kind,
    name: d.name,
    size: d.size,
    url: d.url,
    thumbUrl: d.thumbUrl,
    width: d.width,
    height: d.height,
    durationMs: d.durationMs,
    waveform: d.waveform,
    state:
      d.status === "ready" ? ("ready" as const) : d.status === "failed" ? ("failed" as const) : ("processing" as const),
    progress: 1,
  };
}

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-label={`Uploading ${Math.round(value * 100)}%`}>
      <circle cx="22" cy="22" r={r} fill="rgb(0 0 0 / 0.45)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.03, value))}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

function Overlay({ state, progress }: { state: ReturnType<typeof view>["state"]; progress: number }) {
  if (state === "ready") return null;
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/25 text-white">
      {state === "uploading" ? (
        <ProgressRing value={progress} />
      ) : state === "processing" ? (
        <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> Processing…
        </span>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-red-600/80 px-2.5 py-1 text-xs">
          <AlertCircle className="size-3.5" /> Failed
        </span>
      )}
    </div>
  );
}

function boxSize(width: number | null, height: number | null) {
  const w = width ?? 4;
  const h = height ?? 3;
  const maxW = 280;
  const maxH = 340;
  const scale = Math.min(maxW / w, maxH / h, 1.5);
  return { width: Math.max(120, Math.round(w * scale)), aspectRatio: `${w} / ${h}` };
}

let playing: HTMLMediaElement | null = null;

function SpeedButton({ className = "" }: { className?: string }) {
  const rate = usePlaybackRate((s) => s.rate);
  const next = usePlaybackRate((s) => s.next);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        next();
      }}
      aria-label={`Playback speed ${rate}×, tap to change`}
      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${className}`}
    >
      {rate}×
    </button>
  );
}

export function VoicePlayer({
  autoPlay = false,
  url,
  durationMs,
  waveform,
  mine,
}: {
  autoPlay?: boolean;
  url: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  mine: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const rate = usePlaybackRate((s) => s.rate);
  const bars = waveform ?? Array.from({ length: 48 }, () => 18);
  const total = durationMs ?? 0;

  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoPlay || !url || autoStarted.current) return;
    autoStarted.current = true;
    toggle();
  });

  function toggle() {
    if (!url) return;
    if (!audio.current) {
      const el = new Audio(url);
      el.playbackRate = rate;
      el.ontimeupdate = () => setPosition(el.currentTime * 1000);
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
      el.onended = () => {
        setPlaying(false);
        setPosition(0);
      };
      audio.current = el;
    }
    const el = audio.current;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      void el.play();
    } else el.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = (((e.clientX - rect.left) / rect.width) * total) / 1000;
    setPosition(el.currentTime * 1000);
  }

  const done = total ? position / total : 0;
  return (
    <div className="flex w-60 max-w-full items-center gap-3 py-1">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={isPlaying ? "Pause" : "Play voice message"}
        className={`grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-50 ${
          mine ? "bg-brand-ink text-brand" : "bg-brand text-brand-ink"
        }`}
      >
        {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} className="flex h-8 cursor-pointer items-center gap-[2px]" aria-hidden>
          {bars.map((v, i) => (
            <span
              key={i}
              className={`w-[2px] flex-1 rounded-full ${i / bars.length < done ? "bg-current" : "bg-current opacity-35"}`}
              style={{ height: `${Math.max(12, v)}%` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] opacity-70">{formatDuration(isPlaying || position ? position : total)}</p>
          <SpeedButton className={mine ? "bg-brand-ink/15" : "bg-brand/15 text-brand"} />
        </div>
      </div>
    </div>
  );
}

function VideoNote({
  autoPlay = false,
  url,
  poster,
  local,
  durationMs,
  state,
  progress,
}: {
  autoPlay?: boolean;
  url: string | null;
  poster: string | null;
  local: string | null;
  durationMs: number | null;
  state: ReturnType<typeof view>["state"];
  progress: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const rate = usePlaybackRate((s) => s.rate);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const total = durationMs ? durationMs / 1000 : 0;

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate;
  }, [rate]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoPlay || !url || autoStarted.current) return;
    autoStarted.current = true;
    toggle();
  });

  function toggle() {
    const el = video.current;
    if (!el || !url) return;
    if (el.paused) {
      if (playing && playing !== el) playing.pause();
      playing = el;
      el.muted = false;
      el.playbackRate = rate;
      void el.play();
    } else el.pause();
  }

  const r = 49;
  const c = 2 * Math.PI * r;
  const done = total ? position / total : 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={isPlaying ? "Pause video message" : "Play video message"}
        className="relative block size-56 shrink-0 md:size-64"
      >
        <span className="absolute inset-0 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700">
          <video
            ref={video}
            src={url ?? local ?? undefined}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setPosition(0);
            }}
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            className="size-full object-cover"
          />
        </span>
        {isPlaying && (
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-1.5 -rotate-90" aria-hidden>
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - done)}
            />
          </svg>
        )}
        {state === "ready" && !isPlaying && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white">
              <Play className="ml-0.5 size-6 fill-current" />
            </span>
          </span>
        )}
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
          {formatDuration(isPlaying ? position * 1000 : durationMs)}
        </span>
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <Overlay state={state} progress={progress} />
        </span>
      </button>
      {isPlaying && <SpeedButton className="bg-black/50 text-white" />}
    </div>
  );
}

export function AttachmentView({
  attachment,
  mine,
  onOpen,
  hidden = false,
  onReveal,
  autoPlay = false,
}: {
  attachment: ShownAttachment;
  mine: boolean;
  onOpen: (item: LightboxItem) => void;
  hidden?: boolean;
  onReveal?: () => void;
  autoPlay?: boolean;
}) {
  const a = view(attachment);

  if (a.kind === "gif") {
    const size = boxSize(a.width, a.height);
    return (
      <div
        className="relative overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-700"
        style={{ width: size.width, aspectRatio: size.aspectRatio, maxWidth: "100%" }}
      >
        {hidden ? (
          <button
            type="button"
            onClick={onReveal}
            aria-label="Spoiler, tap to reveal"
            className="spoiler absolute inset-0 grid place-items-center rounded-none text-white/85"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white">
              <EyeOff className="size-3.5" /> Spoiler
            </span>
          </button>
        ) : attachment.source === "local" ? (
          <img src={a.url ?? undefined} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          a.url && <video src={a.url} autoPlay loop muted playsInline className="size-full object-cover" />
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/50 px-1 text-[10px] font-bold text-white">GIF</span>
        {a.state === "failed" && <Overlay state={a.state} progress={a.progress} />}
      </div>
    );
  }

  if (a.kind === "image" || a.kind === "video") {
    const size = boxSize(a.width, a.height);
    const ready = a.state === "ready" && a.url;
    const open = () =>
      ready && onOpen({ kind: a.kind as "image" | "video", url: a.url!, poster: a.thumbUrl, name: a.name });
    return (
      <button
        type="button"
        onClick={hidden ? onReveal : open}
        disabled={!ready && !hidden}
        className="relative block overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-700"
        style={{ width: size.width, aspectRatio: size.aspectRatio, maxWidth: "100%" }}
        aria-label={hidden ? "Spoiler, tap to reveal" : a.kind === "image" ? "Open photo" : "Play video"}
      >
        {a.thumbUrl && (
          <img
            src={a.thumbUrl}
            alt=""
            className={`size-full object-cover transition duration-300 ${hidden ? "scale-125 blur-2xl brightness-75" : ""}`}
            draggable={false}
          />
        )}
        {hidden && (
          <>
            <span className="spoiler absolute inset-0 rounded-none text-white/85" aria-hidden />
            <span className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <EyeOff className="size-3.5" /> Spoiler
              </span>
            </span>
          </>
        )}
        {a.kind === "video" && a.state === "ready" && !hidden && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-12 place-items-center rounded-full bg-black/50 text-white">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
            </span>
            <span className="absolute top-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[11px] text-white">
              {formatDuration(a.durationMs)}
            </span>
          </>
        )}
        <Overlay state={a.state} progress={a.progress} />
      </button>
    );
  }

  if (a.kind === "video_note") {
    return (
      <VideoNote
        autoPlay={autoPlay}
        url={a.state === "ready" ? a.url : null}
        poster={a.thumbUrl}
        local={attachment.source === "local" ? a.url : null}
        durationMs={a.durationMs}
        state={a.state}
        progress={a.progress}
      />
    );
  }

  if (a.kind === "voice") {
    return (
      <div className="relative">
        <VoicePlayer
          autoPlay={autoPlay}
          url={a.state === "ready" ? a.url : null}
          durationMs={a.durationMs}
          waveform={a.waveform}
          mine={mine}
        />
        {a.state !== "ready" && (
          <p className="flex items-center gap-1 text-[11px] opacity-70">
            {a.state === "failed" ? <AlertCircle className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
            {a.state === "uploading"
              ? `Uploading ${Math.round(a.progress * 100)}%`
              : a.state === "failed"
                ? "Failed"
                : "Processing…"}
          </p>
        )}
      </div>
    );
  }

  const ready = a.state === "ready" && a.url;
  return (
    <a
      href={ready ? a.url! : undefined}
      download={a.name}
      onClick={(e) => !ready && e.preventDefault()}
      className="flex w-64 max-w-full items-center gap-3 py-1"
    >
      <span
        className={`relative grid size-11 shrink-0 place-items-center rounded-full ${
          mine ? "bg-brand-ink/15" : "bg-brand/15 text-brand"
        }`}
      >
        {a.state === "uploading" ? (
          <Loader2 className="size-5 animate-spin" />
        ) : ready ? (
          <Download className="size-5" />
        ) : (
          <FileText className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name}</span>
        <span className="block text-xs opacity-70">
          {a.state === "uploading" ? `${Math.round(a.progress * 100)}% of ${formatBytes(a.size)}` : formatBytes(a.size)}
        </span>
      </span>
    </a>
  );
}

export function Lightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal aria-label={item.name}>
        <div className="flex items-center justify-end gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <a
            href={item.url}
            download={item.name}
            aria-label="Download"
            className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <Download className="size-5" />
          </a>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
        </div>
        <div
          className="grid min-h-0 flex-1 place-items-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {item.kind === "image" ? (
            <img src={item.url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <video
              src={item.url}
              poster={item.poster ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full"
            />
          )}
        </div>
      </div>
    </Portal>
  );
}
