"use client";

import { type AttachmentDTO, type EncryptedFile, NO_ZOOM, type ZoomView, zoomTo } from "@six/shared";
import { AlertCircle, ChevronLeft, ChevronRight, Download, EyeOff, FileText, FileX, Loader2, Pause, Play, X } from "lucide-react";
import { ProtectedImage, noSave } from "./protected-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { decryptedUrl, streamUrl } from "@/lib/e2ee";
import { formatBytes, formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { PendingAttachment } from "@/lib/outbox";
import { usePlaybackRate } from "@/lib/playback";
import { Portal } from "./portal";

export type ShownAttachment =
  | { source: "server"; data: AttachmentDTO; file?: EncryptedFile }
  | { source: "local"; data: PendingAttachment; failed: boolean };

export interface LightboxItem {
  kind: "image" | "video";
  url: string;
  poster: string | null;
  name: string;
}

interface Decrypted {
  url: string | null;
  failed: boolean;
}

/** The decrypted copy of an encrypted attachment, fetched once `enabled` turns true. */
function useDecrypted(a: ShownAttachment, enabled: boolean): Decrypted | null {
  const sealed = a.source === "server" && a.data.encrypted ? a : null;
  const [state, setState] = useState<Decrypted>({ url: null, failed: false });
  const id = sealed?.data.id;
  const url = sealed?.data.url;
  const file = sealed?.file;
  useEffect(() => {
    if (!id || !file || !enabled) return;
    let live = true;
    decryptedUrl({ id, url: url ?? null }, file).then(
      (u) => live && setState({ url: u, failed: false }),
      () => live && setState({ url: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [id, url, file, enabled]);
  if (!sealed) return null;
  return sealed.file ? state : { url: null, failed: true };
}

/** The attachment's file URL, decrypting it first when it's encrypted. */
export function useAttachmentUrl(a: ShownAttachment) {
  return view(a, useDecrypted(a, true)).url;
}

function view(a: ShownAttachment, decrypted: Decrypted | null) {
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
  if (decrypted) {
    return {
      kind: d.kind,
      name: d.name,
      size: d.size,
      url: decrypted.url,
      thumbUrl: (d.kind === "image" && decrypted.url) || a.file?.thumb || null,
      width: d.width,
      height: d.height,
      durationMs: d.durationMs,
      waveform: d.waveform,
      state:
        decrypted.failed || d.status === "failed"
          ? ("failed" as const)
          : d.status === "ready"
            ? ("ready" as const)
            : ("processing" as const),
      progress: 1,
    };
  }
  return {
    kind: d.kind,
    name: d.name,
    size: d.size,
    url: d.url,
    thumbUrl: d.mime === "image/gif" && d.url ? d.url : d.thumbUrl,
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
  const tr = useT();
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-label={tr.messages.uploading(Math.round(value * 100))}>
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
  const tr = useT();
  if (state === "ready") return null;
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/25 text-white">
      {state === "uploading" ? (
        <ProgressRing value={progress} />
      ) : state === "processing" ? (
        <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> {tr.messages.processing}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-red-600/80 px-2.5 py-1 text-xs">
          <AlertCircle className="size-3.5" /> {tr.messages.failed}
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
  const tr = useT();
  const rate = usePlaybackRate((s) => s.rate);
  const next = usePlaybackRate((s) => s.next);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        next();
      }}
      aria-label={tr.messages.speed(rate)}
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
  label,
  compact = false,
  meta,
}: {
  autoPlay?: boolean;
  url: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  mine: boolean;
  label?: string;
  compact?: boolean;
  meta?: React.ReactNode;
}) {
  const tr = useT();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [loadedMs, setLoadedMs] = useState(0);
  const rate = usePlaybackRate((s) => s.rate);
  const bars = waveform ?? Array.from({ length: 48 }, () => 18);
  const total = durationMs ?? loadedMs;

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
      el.ondurationchange = () => Number.isFinite(el.duration) && setLoadedMs(el.duration * 1000);
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
    <div className={`flex max-w-full items-center ${compact ? "min-w-0 flex-1 gap-2" : "w-96 gap-3 py-1"}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={isPlaying ? tr.messages.pause : (label ?? tr.messages.playVoice)}
        className={`grid ${compact ? "size-8" : "size-10"} shrink-0 place-items-center rounded-full disabled:opacity-50 ${
          mine ? "bg-brand-ink text-brand" : "bg-brand text-brand-ink"
        }`}
      >
        {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <div className={`flex min-w-0 flex-1 items-center ${compact ? "gap-2" : "flex-wrap gap-x-2"}`}>
        <div
          onClick={seek}
          className={`flex cursor-pointer items-center gap-[2px] ${compact ? "h-6 min-w-0 flex-1" : "h-8 min-w-40 flex-1"}`}
          aria-hidden
        >
          {bars.map((v, i) => (
            <span
              key={i}
              className={`w-[2px] flex-1 rounded-full ${i / bars.length < done ? "bg-current" : "bg-current opacity-35"}`}
              style={{ height: `${Math.max(12, v)}%` }}
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <p className="text-[11px] opacity-70">{formatDuration(isPlaying || position ? position : total)}</p>
          <SpeedButton className={mine ? "bg-brand-ink/15" : "bg-brand/15 text-brand"} />
        </div>
        {meta}
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
  const tr = useT();
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
        aria-label={isPlaying ? tr.messages.pauseVideoNote : tr.messages.playVideoNote}
        className="relative block size-56 shrink-0 md:size-64"
      >
        <span className="absolute inset-0 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700">
          <video
            ref={video}
            src={url ?? local ?? undefined}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            {...noSave}
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
  hiddenLabel,
  onReveal,
  autoPlay = false,
  tile = false,
  meta,
}: {
  attachment: ShownAttachment;
  mine: boolean;
  onOpen: (item: LightboxItem) => void;
  hidden?: boolean;
  /** What the chip on a hidden photo says; a spoiler by default. */
  hiddenLabel?: string;
  onReveal?: () => void;
  autoPlay?: boolean;
  /** Fill the parent, as one tile of an album, instead of sizing to the photo. */
  tile?: boolean;
  meta?: React.ReactNode;
}) {
  const tr = useT();
  const kind = attachment.data.kind;
  const audio = kind === "file" && attachment.data.mime.startsWith("audio/");
  const [wanted, setWanted] = useState(false);
  const decrypted = useDecrypted(
    attachment,
    wanted || audio || kind === "image" || kind === "voice" || kind === "video_note",
  );
  const a = view(attachment, decrypted);
  const fetching = wanted && !!decrypted && !decrypted.url && !decrypted.failed;

  useEffect(() => {
    if (!wanted || !decrypted?.url) return;
    setWanted(false);
    if (a.kind === "video") onOpen({ kind: "video", url: decrypted.url, poster: a.thumbUrl, name: a.name });
    if (a.kind === "file") {
      const link = document.createElement("a");
      link.href = decrypted.url;
      link.download = a.name;
      link.click();
    }
  }, [wanted, decrypted?.url, a.kind, a.name, a.thumbUrl, onOpen]);

  if (attachment.source === "server" && attachment.data.status === "removed") {
    return (
      <span className="flex w-64 max-w-full items-center gap-3 px-1 py-1 opacity-75">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-stone-500/15">
          <FileX className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.name}</span>
          <span className="block text-xs">
            {tr.messages.fileRemoved} · {formatBytes(a.size)}
          </span>
        </span>
      </span>
    );
  }

  const box = (w: number | null, h: number | null) => {
    const size = boxSize(w, h);
    return tile ? { width: "100%", height: "100%" } : { width: size.width, aspectRatio: size.aspectRatio, maxWidth: "100%" };
  };
  const hiddenChip = hiddenLabel ?? tr.summary.spoiler;

  if (a.kind === "gif") {
    return (
      <div
        className={`relative overflow-hidden bg-stone-200 dark:bg-stone-700 ${tile ? "" : "rounded-xl"}`}
        style={box(a.width, a.height)}
      >
        {hidden ? (
          <button
            type="button"
            onClick={onReveal}
            aria-label={tr.messages.revealSpoiler}
            className="spoiler absolute inset-0 grid place-items-center rounded-none text-white/85"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white">
              <EyeOff className="size-3.5" /> {hiddenChip}
            </span>
          </button>
        ) : attachment.source === "local" ? (
          <img src={a.url ?? undefined} alt="" draggable={false} className="size-full object-cover" />
        ) : (
          a.url && (
            <video
              src={a.url}
              autoPlay
              loop
              muted
              playsInline
              disablePictureInPicture
              {...noSave}
              className="size-full object-cover"
            />
          )
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/50 px-1 text-[10px] font-bold text-white">GIF</span>
        {a.state === "failed" && <Overlay state={a.state} progress={a.progress} />}
      </div>
    );
  }

  if (a.kind === "image" || a.kind === "video") {
    const ready = a.state === "ready" && (a.url || decrypted);
    const open = () => {
      if (!ready) return;
      const stream =
        attachment.source === "server" && attachment.data.encrypted && a.kind === "video" && attachment.file
          ? streamUrl(attachment.data, attachment.file)
          : null;
      if (stream) onOpen({ kind: "video", url: stream, poster: a.thumbUrl, name: a.name });
      else if (!a.url) setWanted(true);
      else onOpen({ kind: a.kind as "image" | "video", url: a.url, poster: a.thumbUrl, name: a.name });
    };
    return (
      <button
        type="button"
        onClick={hidden ? onReveal : open}
        disabled={!ready && !hidden}
        className={`relative block overflow-hidden bg-stone-200 dark:bg-stone-700 ${tile ? "" : "rounded-xl"}`}
        style={box(a.width, a.height)}
        aria-label={hidden ? tr.messages.revealSpoiler : a.kind === "image" ? tr.messages.openPhoto : tr.messages.playVideo}
      >
        {a.thumbUrl && (
          <ProtectedImage
            src={a.thumbUrl}
            fit={a.kind === "video" && !tile ? "contain" : "cover"}
            className={`size-full transition duration-300 ${hidden ? "scale-125 blur-2xl brightness-75" : ""}`}
          />
        )}
        {hidden && (
          <>
            <span className="spoiler absolute inset-0 rounded-none text-white/85" aria-hidden />
            <span className="absolute inset-0 grid place-items-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <EyeOff className="size-3.5" /> {hiddenChip}
              </span>
            </span>
          </>
        )}
        {a.kind === "video" && a.state === "ready" && !hidden && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-12 place-items-center rounded-full bg-black/50 text-white">
                {fetching ? <Loader2 className="size-6 animate-spin" /> : <Play className="ml-0.5 size-6 fill-current" />}
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
          meta={meta}
        />
        {a.state !== "ready" && (
          <p className="flex items-center gap-1 text-[11px] opacity-70">
            {a.state === "failed" ? <AlertCircle className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
            {a.state === "uploading"
              ? tr.messages.uploading(Math.round(a.progress * 100))
              : a.state === "failed"
                ? tr.messages.failed
                : tr.messages.processing}
          </p>
        )}
      </div>
    );
  }

  if (audio && a.state === "ready") {
    return (
      <div className="w-64 max-w-full pt-1">
        <p className="truncate text-sm font-medium">{a.name}</p>
        <VoicePlayer url={a.url} durationMs={a.durationMs} waveform={null} mine={mine} label={tr.messages.playAudio} />
      </div>
    );
  }

  const ready = a.state === "ready" && a.url;
  return (
    <a
      href={ready ? a.url! : undefined}
      download={a.name}
      onClick={(e) => {
        if (ready) return;
        e.preventDefault();
        if (decrypted && a.state === "ready") setWanted(true);
      }}
      className="flex w-64 max-w-full items-center gap-3 py-1"
    >
      <span
        className={`relative grid size-11 shrink-0 place-items-center rounded-full ${
          mine ? "bg-brand-ink/15" : "bg-brand/15 text-brand"
        }`}
      >
        {a.state === "uploading" || fetching ? (
          <Loader2 className="size-5 animate-spin" />
        ) : ready || (decrypted && a.state === "ready") ? (
          <Download className="size-5" />
        ) : (
          <FileText className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name}</span>
        <span className="block text-xs opacity-70">
          {a.state === "uploading"
            ? tr.messages.uploadedOf(Math.round(a.progress * 100), formatBytes(a.size))
            : formatBytes(a.size)}
        </span>
      </span>
    </a>
  );
}

type Point = { x: number; y: number };

/**
 * A full-screen photo that zooms with a pinch, a double tap (or click) or the wheel, and drags around once
 * zoomed in. While it's zoomed or pinched, swipes stay here instead of flipping the album around it.
 */
function ZoomImage({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(NO_ZOOM);
  const [live, setLive] = useState(false);
  const current = useRef(zoom);
  current.current = zoom;
  const points = useRef(new Map<number, Point>());
  const gesture = useRef<{ was: ZoomView; mid: Point; d: number; moved: boolean } | null>(null);
  const keepSwipe = useRef(true);
  const lastTap = useRef(0);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  const zoomBox = (s: number, from: Point, to: Point, was = current.current) => {
    const r = box.current!.getBoundingClientRect();
    return zoomTo(was, s, from, to, r.width, r.height);
  };
  const span = () => {
    const [a, b = a] = [...points.current.values()];
    return { mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, d: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };
  const anchor = (moved: boolean) => (gesture.current = { was: current.current, ...span(), moved });

  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      setZoom((z) => zoomBox(z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), p, p, z));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function lift(e: React.PointerEvent) {
    if (!points.current.delete(e.pointerId)) return;
    if (points.current.size) return void anchor(true);
    const moved = gesture.current?.moved;
    gesture.current = null;
    setLive(false);
    if (moved || e.type === "pointercancel") return;
    if (e.timeStamp - lastTap.current > 300) {
      lastTap.current = e.timeStamp;
      return;
    }
    lastTap.current = 0;
    const p = local(e);
    setZoom((z) => (z.s > 1 ? NO_ZOOM : zoomBox(2.5, p, p, z)));
  }

  return (
    <div
      ref={box}
      className={`size-full touch-none overflow-hidden ${zoom.s > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        points.current.set(e.pointerId, local(e));
        const many = points.current.size > 1;
        keepSwipe.current = !many && current.current.s === 1;
        anchor(many || !!gesture.current?.moved);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || !points.current.has(e.pointerId)) return;
        points.current.set(e.pointerId, local(e));
        const { mid, d } = span();
        if (!g.moved && Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) < 8) return;
        g.moved = true;
        if (points.current.size === 1 && g.was.s === 1) return;
        setLive(true);
        setZoom(zoomBox(g.d ? (g.was.s * d) / g.d : g.was.s, g.mid, mid, g.was));
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onTouchEnd={(e) => !keepSwipe.current && e.stopPropagation()}
    >
      <ProtectedImage
        src={src}
        fit="contain"
        className="size-full"
        style={{
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
          transition: live ? "none" : "transform 200ms ease-out",
        }}
      />
    </div>
  );
}

export function Lightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  const tr = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal aria-label={item.name}>
        <div className="flex items-center justify-end gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            onClick={onClose}
            aria-label={tr.common.close}
            className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
        </div>
        <div
          className="relative grid min-h-0 flex-1 place-items-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {item.kind === "image" ? <ZoomImage src={item.url} /> : <FullVideo src={item.url} poster={item.poster} />}
        </div>
      </div>
    </Portal>
  );
}

/** Fills the viewer and letterboxes the video, so it is never cropped whatever its shape. */
function FullVideo({ src, poster }: { src: string; poster: string | null }) {
  return (
    <div className="absolute inset-0 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        autoPlay
        playsInline
        {...noSave}
        className="size-full object-contain"
      />
    </div>
  );
}

function AlbumSlide({ attachment }: { attachment: ShownAttachment }) {
  const [stream] = useState(() =>
    attachment.source === "server" && attachment.data.encrypted && attachment.data.kind === "video" && attachment.file
      ? streamUrl(attachment.data, attachment.file)
      : null,
  );
  const decrypted = useDecrypted(attachment, !stream);
  const a = view(attachment, decrypted);
  const url = stream ?? a.url;
  if (!url) return <Loader2 className="size-8 animate-spin text-white/70" />;
  return a.kind === "video" ? <FullVideo src={url} poster={a.thumbUrl} /> : <ZoomImage src={url} />;
}

/** Shows an album's photos and videos one at a time: swipe, the arrow keys or the side buttons move between them. */
export function AlbumViewer({
  items,
  start,
  onClose,
  onShow,
}: {
  items: ShownAttachment[];
  start: number;
  onClose: () => void;
  /** Adds a "Show in chat" button that hands back the index of the photo on screen. */
  onShow?: (index: number) => void;
}) {
  const tr = useT();
  const [index, setIndex] = useState(start);
  const touch = useRef<number | null>(null);
  const go = useCallback((by: number) => setIndex((i) => Math.min(items.length - 1, Math.max(0, i + by))), [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  const side = "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-0";
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal>
        <div className="flex items-center justify-between gap-1 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <span className="flex-1 px-3 text-sm text-white/80 tabular-nums">
            {index + 1} / {items.length}
          </span>
          {onShow && (
            <button
              onClick={() => onShow(index)}
              className="rounded-full px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              {tr.chat.showInChat}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label={tr.common.close}
            className="grid size-10 place-items-center rounded-full text-white hover:bg-white/10"
          >
            <X className="size-6" />
          </button>
        </div>
        <div
          className="relative grid min-h-0 flex-1 touch-pan-y place-items-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          onClick={(e) => e.target === e.currentTarget && onClose()}
          onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0]!.clientX - (touch.current ?? e.changedTouches[0]!.clientX);
            touch.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          <AlbumSlide key={index} attachment={items[index]!} />
          <button onClick={() => go(-1)} disabled={index === 0} aria-label={tr.messages.previous} className={`${side} left-3`}>
            <ChevronLeft className="size-6" />
          </button>
          <button
            onClick={() => go(1)}
            disabled={index === items.length - 1}
            aria-label={tr.messages.next}
            className={`${side} right-3`}
          >
            <ChevronRight className="size-6" />
          </button>
        </div>
      </div>
    </Portal>
  );
}
