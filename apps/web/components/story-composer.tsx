"use client";

import { kindFor } from "@six/sdk";
import {
  type AnonMessageDTO,
  type StoryDTO,
  EDIT_COLORS,
  EMPTY_DRAWING,
  STORY_PEN_SIZES,
  type GifDTO,
  STORY_BACKGROUNDS,
  STORY_DEFAULT_SECS,
  STORY_DURATIONS,
  STORY_LIMITS,
  type StoryLocation,
  durationLabel,
  storyBackground,
  trimVideo,
  type StoryDrawing,
  type StoryPositions,
  type StorySpot,
  type StorySticker,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Camera, CaseSensitive, ChevronDown, Clock, Hourglass, ImagePlus, Loader2, MapPin, Pencil, Scissors, SendHorizontal, Sticker, Type, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { getLocale, useT } from "@/lib/i18n";
import { mediaMeta } from "@/lib/media-meta";
import { six } from "@/lib/six";
import { postStory } from "@/lib/story-post";
import { CameraDialog } from "./camera-dialog";
import { GifSearch } from "./gif-picker";
import { currentPosition } from "./location-card";
import { Portal } from "./portal";
import { Sheet } from "./sheet";
import { ChatBubbleCard, FromChatLabel, StoryStickers, backgroundAround } from "./stories";
import { LastsPicker } from "./notes";
import { DrawBar, type Pen, StoryDrawingLayer, TextWriter, type Writing } from "./story-drawing";
import { VideoTrimmer } from "./video-trimmer";

const MEDIA_TYPES = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";

const tool = (on: boolean) =>
  `pointer-events-auto grid size-11 place-items-center rounded-full backdrop-blur transition active:scale-95 ${
    on ? "bg-white text-stone-900" : "bg-black/35 text-white hover:bg-black/50"
  }`;

const swatchInput =
  "size-8 cursor-pointer rounded-full border-2 border-white bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0";

const field =
  "w-full rounded-full bg-black/40 px-4 py-2.5 text-[16px] text-white outline-none backdrop-blur placeholder:text-white/60 focus:ring-2 focus:ring-white/60";

/**
 * Makes a story: text on a colour, or a photo or video, with a GIF, the place, the date or the time on top. With
 * `anon`, it starts with that anonymous message on it as a card, to answer in front of everyone.
 */
export function StoryComposer({
  anon,
  initialText,
  bubble,
  quote,
  onClose,
}: {
  anon?: AnonMessageDTO;
  initialText?: string;
  bubble?: string;
  quote?: StoryDTO["quote"] & { messageId: string };
  onClose: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>();
  const [videoMs, setVideoMs] = useState<number | null>(null);
  const [text, setText] = useState(initialText ?? "");
  const [background, setBackground] = useState<string>(initialText ? backgroundAround(bubble) : STORY_BACKGROUNDS[0]);
  const [custom, setCustom] = useState(false);
  const [from, to] = background.split(",") as [string, string | undefined];
  const [gif, setGif] = useState<GifDTO | null>(null);
  const [ask, setAsk] = useState(anon ?? null);
  const [pickingGif, setPickingGif] = useState(false);
  const [camera, setCamera] = useState(false);
  const [location, setLocation] = useState<StoryLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [durationSecs, setDurationSecs] = useState<number>(STORY_DEFAULT_SECS);
  const [cutting, setCutting] = useState(false);
  const [pickingDuration, setPickingDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState(false);
  const [positions, setPositions] = useState<StoryPositions>({});
  const [drawing, setDrawing] = useState<StoryDrawing>(EMPTY_DRAWING);
  const [undos, setUndos] = useState<StoryDrawing[]>([]);
  const [pen, setPen] = useState<Pen>({ shape: "pen", color: EDIT_COLORS[0]!, size: STORY_PEN_SIZES[1] });
  const [drawingOn, setDrawingOn] = useState(false);
  const [writing, setWriting] = useState<Writing | null>(null);
  const drawn = drawing.strokes.length > 0 || drawing.texts.length > 0;
  const card = useRef<HTMLDivElement>(null);
  const placeField = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = file ? kindFor(file.type) : null;
  const tooLong = kind === "video" && (videoMs ?? 0) > STORY_LIMITS.videoMs + STORY_LIMITS.videoSlackMs;
  const ready = (!!file || !!text.trim() || !!gif || !!ask || drawn) && !tooLong;
  const fromChat = !!initialText && !file;

  useEffect(() => {
    if (!file) return setUrl(undefined);
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  useCloseOnBack(() => {
    if (writing) setWriting(null);
    else if (drawingOn) setDrawingOn(false);
    else onClose();
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const media = [...(e.clipboardData?.files ?? [])].find((f) => /^(image|video)\//.test(f.type));
      if (!media) return;
      e.preventDefault();
      void pickRef.current(media);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const keep = () => setUndos((u) => [...u, drawing]);
  function finishWriting() {
    const w = writing!;
    setWriting(null);
    const words = w.text.trim();
    if (!words && w.index < 0) return;
    keep();
    const old = drawing.texts[w.index];
    const t = { text: words, color: w.color, font: w.font, look: w.look, x: old?.x ?? 0.5, y: old?.y ?? 0.4, scale: old?.scale ?? 1 };
    setDrawing((d) => ({
      ...d,
      texts: !words ? d.texts.filter((_, i) => i !== w.index) : w.index < 0 ? [...d.texts, t] : d.texts.map((it, i) => (i === w.index ? t : it)),
    }));
  }

  async function pick(picked: File | undefined) {
    if (!picked) return;
    const k = kindFor(picked.type);
    if (k !== "image" && k !== "video") return;
    setError(null);
    setFile(picked);
    setVideoMs(k === "video" ? ((await mediaMeta(picked, "video")).durationMs ?? null) : null);
  }
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  async function cut(from: number, to: number) {
    setCutting(false);
    const out = file && trimVideo(new Uint8Array(await file.arrayBuffer()), from, to);
    if (!out || !file) return setError(tr.composer.cantCut);
    await pick(new File([out], file.name, { type: file.type }));
  }

  async function locate() {
    if (location) return setLocation(null);
    setLocating(true);
    setError(null);
    try {
      const spot = await currentPosition();
      setLocation(spot);
      void six.api
        .GET("/v1/place-name", { params: { query: { lat: spot.lat, lng: spot.lng, locale: getLocale() } } })
        .then(({ data }) => data?.name && setLocation((l) => (l && !l.name ? { ...l, name: data.name! } : l)))
        .catch(() => null);
    } catch (err) {
      setError((err as Error).message === "denied" ? tr.composer.locationDenied : tr.composer.locationFailed);
    } finally {
      setLocating(false);
    }
  }

  function share() {
    if (!ready) return;
    void postStory(
      qc,
      {
        text: text.trim() || undefined,
        fromChat,
        bubble: fromChat ? bubble : undefined,
        messageId: fromChat ? quote?.messageId : undefined,
        background,
        gifId: gif?.id,
        askId: ask?.id,
        location: location ? { ...location, name: location.name?.trim() || undefined } : undefined,
        showDate,
        showTime,
        positions,
        drawing: drawn ? drawing : undefined,
        durationSecs,
      },
      file && kind ? { blob: file, kind, name: file.name, mime: file.type } : undefined,
    );
    onClose();
  }

  const stickers = {
    ask: ask && { text: ask.text, prompt: ask.prompt, photoUrl: ask.photoUrl, gif: ask.gif },
    gif: gif && <img src={gif.previewUrl} alt={gif.title} draggable={false} className="max-h-40 max-w-56 rounded-xl" />,
    location,
    showDate,
    showTime,
    at: new Date().toISOString(),
    positions,
    frame: card,
    onMove: (sticker: StorySticker, spot: StorySpot) => setPositions((p) => ({ ...p, [sticker]: spot })),
    onRemove: (sticker: StorySticker) => {
      ({
        ask: () => setAsk(null),
        gif: () => setGif(null),
        location: () => setLocation(null),
        date: () => setShowDate(false),
        time: () => setShowTime(false),
      })[sticker]();
      setPositions((p) => {
        const next = { ...p };
        delete next[sticker];
        return next;
      });
    },
    onTap: (sticker: StorySticker) => {
      if (sticker === "gif") setPickingGif(true);
      if (sticker === "location") placeField.current?.focus();
    },
  };

  const tools = [
    ...(file ? [{ label: tr.stories.text, icon: Type, on: false, onClick: () => setFile(null) }] : []),
    { label: `${tr.stories.photo} / ${tr.stories.video}`, icon: ImagePlus, on: !!file, onClick: () => picker.current?.click() },
    { label: tr.composer.camera, icon: Camera, on: false, onClick: () => setCamera(true) },
    { label: tr.stories.gif, icon: Sticker, on: !!gif || pickingGif, onClick: () => (gif ? setGif(null) : setPickingGif(!pickingGif)) },
    { label: tr.stories.location, icon: locating ? Loader2 : MapPin, on: !!location, onClick: () => void locate() },
    { label: tr.stories.date, icon: CalendarDays, on: showDate, onClick: () => setShowDate(!showDate) },
    { label: tr.stories.time, icon: Clock, on: showTime, onClick: () => setShowTime(!showTime) },
    { label: tr.composer.editTools.draw, icon: Pencil, on: drawingOn, onClick: () => setDrawingOn(!drawingOn) },
    {
      label: tr.stories.addText,
      icon: CaseSensitive,
      on: false,
      onClick: () => {
        setDrawingOn(false);
        if (drawing.texts.length < 10) setWriting({ index: -1, text: "", color: EDIT_COLORS[0]!, font: "classic", look: "plain" });
      },
    },
  ];

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white"
        role="dialog"
        aria-modal
        aria-label={tr.stories.newStory}
      >
        <div
          ref={card}
          className="relative flex h-full w-full flex-col overflow-hidden md:aspect-[9/16] md:h-[min(92dvh,52rem)] md:w-auto md:rounded-3xl"
          style={{ background: file ? "#000" : storyBackground(background) }}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {kind === "image" && url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
            {kind === "video" && url && <video src={url} autoPlay loop muted playsInline className="max-h-full max-w-full" />}
            {fromChat && (
              <>
                <ChatBubbleCard text={text} bubble={bubble ?? null} quote={quote ?? null} />
                <FromChatLabel />
              </>
            )}
            {!file && !fromChat && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={STORY_LIMITS.text}
                autoFocus
                placeholder={tr.stories.typeSomething}
                aria-label={tr.stories.text}
                className="w-full resize-none bg-transparent px-16 text-center text-2xl leading-snug font-semibold outline-none placeholder:text-white/60"
                rows={4}
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-3 px-16">
              <StoryStickers {...stickers} placed={false} />
              {file && text.trim() && <p className="text-center break-words whitespace-pre-wrap drop-shadow">{text}</p>}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0">
            <StoryStickers {...stickers} placed />
          </div>
          <StoryDrawingLayer
            drawing={drawing}
            pen={drawingOn ? pen : null}
            onBegin={keep}
            onChange={setDrawing}
            onEditText={(index) => {
              const t = drawing.texts[index]!;
              setWriting({ index, text: t.text, color: t.color, font: t.font, look: t.look ?? "plain" });
            }}
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} aria-label={tr.common.close} title={tr.common.close} className={tool(false)}>
              <X className="size-6" />
            </button>
            <div className="flex flex-col gap-2.5">
              {tools.map(({ label, icon: Icon, on, onClick }) => (
                <button key={label} type="button" onClick={onClick} aria-label={label} aria-pressed={on} title={label} className={tool(on)}>
                  <Icon className={`size-5 ${Icon === Loader2 ? "animate-spin" : ""}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-col gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {drawingOn && (
              <DrawBar
                pen={pen}
                onPen={setPen}
                canUndo={undos.length > 0}
                onUndo={() => {
                  setDrawing(undos.at(-1)!);
                  setUndos(undos.slice(0, -1));
                }}
                onDone={() => setDrawingOn(false)}
              />
            )}
            {!file && !drawingOn && (
              <div className="-mx-4 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div role="radiogroup" aria-label={tr.stories.background} className="mx-auto flex w-max gap-2.5 px-4 py-1.5">
                  {STORY_BACKGROUNDS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={background === c && !custom}
                      aria-label={c}
                      onClick={() => {
                        setBackground(c);
                        setCustom(false);
                      }}
                      style={{ background: storyBackground(c) }}
                      className={`size-7 shrink-0 rounded-full ring-2 transition ${background === c && !custom ? "scale-110 ring-white" : "ring-white/40"}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustom(!custom)}
                    aria-label={tr.stories.customColour}
                    aria-pressed={custom}
                    title={tr.stories.customColour}
                    style={{ background: "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
                    className={`size-7 shrink-0 rounded-full ring-2 transition ${custom ? "scale-110 ring-white" : "ring-white/40"}`}
                  />
                </div>
              </div>
            )}
            {!file && custom && (
              <div className="flex items-center justify-center gap-3 self-center rounded-full bg-black/40 px-4 py-2 backdrop-blur">
                <input type="color" value={from} onChange={(e) => setBackground(to ? `${e.target.value},${to}` : e.target.value)} aria-label={tr.stories.customColour} className={swatchInput} />
                <button
                  type="button"
                  aria-pressed={!!to}
                  onClick={() => setBackground(to ? from : `${from},${from === "#7c3aed" ? "#e11d48" : "#7c3aed"}`)}
                  className={`flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-semibold transition active:scale-95 ${
                    to ? "bg-white text-stone-900" : "bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20"
                  }`}
                >
                  <span
                    className="size-5 rounded-full ring-1 ring-black/10"
                    style={{ background: `linear-gradient(135deg, ${from}, ${to ?? "#7c3aed"})`, opacity: to ? 1 : 0.6 }}
                  />
                  {tr.stories.gradient}
                </button>
                {to && <input type="color" value={to} onChange={(e) => setBackground(`${from},${e.target.value}`)} aria-label={`${tr.stories.gradient} 2`} className={swatchInput} />}
              </div>
            )}
            {location && (
              <input
                ref={placeField}
                value={location.name ?? ""}
                onChange={(e) => setLocation({ ...location, name: e.target.value })}
                maxLength={STORY_LIMITS.place}
                placeholder={tr.stories.placeName}
                aria-label={tr.stories.placeName}
                className={field}
              />
            )}
            {file && (
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={STORY_LIMITS.text}
                placeholder={tr.stories.caption}
                aria-label={tr.stories.caption}
                className={field}
              />
            )}
            {tooLong && (
              <div className="flex items-center gap-3 rounded-2xl bg-red-500/25 p-3 text-sm backdrop-blur">
                <span className="flex-1">{tr.stories.videoTooLong}</span>
                <button type="button" onClick={() => setCutting(true)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-medium text-stone-900">
                  <Scissors className="size-4" />
                  {tr.composer.cut}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-2xl bg-red-500/25 px-3 py-2 text-sm backdrop-blur">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPickingDuration(true)}
                aria-label={`${tr.stories.lasts} ${durationLabel(durationSecs, tr)}`}
                className="flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-2.5 text-sm font-medium backdrop-blur hover:bg-black/55"
              >
                <Hourglass className="size-4" />
                {durationLabel(durationSecs, tr)}
                <ChevronDown className="size-4 opacity-70" />
              </button>
              <button
                type="button"
                onClick={share}
                disabled={!ready}
                className="ml-auto flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-ink transition active:scale-[0.97] disabled:opacity-50"
              >
                {tr.stories.post}
                <SendHorizontal className="size-4" />
              </button>
            </div>
          </div>

          {writing && (
            <TextWriter
              writing={writing}
              onChange={setWriting}
              onDone={finishWriting}
              onRemove={
                writing.index >= 0
                  ? () => {
                      keep();
                      setDrawing((d) => ({ ...d, texts: d.texts.filter((_, i) => i !== writing.index) }));
                      setWriting(null);
                    }
                  : undefined
              }
            />
          )}
          {pickingGif && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col rounded-t-3xl bg-white pt-2 text-stone-900 shadow-2xl dark:bg-stone-900 dark:text-stone-100">
              <button
                type="button"
                onClick={() => setPickingGif(false)}
                aria-label={tr.common.close}
                className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-stone-300 dark:bg-stone-700"
              />
              <div className="min-h-0 overflow-y-auto">
                <GifSearch
                  onPick={(g) => {
                    setGif(g);
                    setPickingGif(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <input
          ref={picker}
          type="file"
          accept={MEDIA_TYPES}
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {camera && (
          <CameraDialog
            videoMs={STORY_LIMITS.videoMs}
            onClose={() => setCamera(false)}
            onCapture={(photo) => {
              setCamera(false);
              void pick(photo);
            }}
          />
        )}
      </div>
      {pickingDuration && (
        <Sheet
          title={tr.stories.lasts}
          actions={[
            ...STORY_DURATIONS.map((secs) => ({
              label: `${durationLabel(secs, tr)}${secs === durationSecs ? " ✓" : ""}`,
              onSelect: () => setDurationSecs(secs),
            })),
            {
              label: (STORY_DURATIONS as readonly number[]).includes(durationSecs) ? tr.stories.custom : `${durationLabel(durationSecs, tr)} ✓`,
              onSelect: () => setCustomDuration(true),
            },
          ]}
          onClose={() => setPickingDuration(false)}
        />
      )}
      {customDuration && <LastsPicker value={durationSecs} onSave={setDurationSecs} onClose={() => setCustomDuration(false)} />}
      {cutting && file && <VideoTrimmer file={file} onCancel={() => setCutting(false)} onDone={(from, to) => void cut(from, to)} />}
    </Portal>
  );
}
