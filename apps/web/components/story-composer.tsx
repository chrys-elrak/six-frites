"use client";

import { kindFor, unwrap } from "@six/sdk";
import {
  type AnonMessageDTO,
  type StoryDTO,
  chatTheme,
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
  STORY_ASKS,
  STORY_GIFS,
  STORY_PHOTOS,
  ASK_PROMPT_MAX,
  askUrl,
  dropSpot,
  stickerIndex,
  landOnTop,
  stickersOn,
  zToTop,
  STORY_STICKER_SCALE,
} from "@six/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Camera,
  CaseSensitive,
  FileClock,
  Check,
  ChevronDown,
  Clock,
  Hourglass,
  ImageOff,
  Link2,
  MessageCircleQuestionMark,
  ImagePlus,
  Images,
  Loader2,
  MapPin,
  Pencil,
  Scissors,
  SendHorizontal,
  Sticker,
  VenetianMask,
  X,
} from "lucide-react";
import { toJpeg } from "html-to-image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { getLocale, useT } from "@/lib/i18n";
import { mediaMeta } from "@/lib/media-meta";
import { chatCardJpeg } from "@/lib/chat-card";
import { clockTime, shortDate, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { postStory } from "@/lib/story-post";
import { type StoryDraft, deleteDraft, draftsKey, saveDraft, useStoryDrafts } from "@/lib/story-drafts";
import { CameraDialog } from "./camera-dialog";
import { GifSearch } from "./gif-picker";
import { currentPosition } from "./location-card";
import { Portal } from "./portal";
import { PrimaryButton } from "./ui";
import { Sheet } from "./sheet";
import { AskCard, ChatBubbleCard, StoryStickers, backgroundAround } from "./stories";
import { LastsPicker } from "./notes";
import { DrawBar, type Pen, StoryDrawingLayer, TextStyler, TextWriter, type Writing, type WrittenStyle, writtenStyle } from "./story-drawing";
import { VideoTrimmer } from "./video-trimmer";

const MEDIA_TYPES = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";

const tool = (on: boolean) =>
  `pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full backdrop-blur transition active:scale-95 ${
    on ? "bg-white text-stone-900" : "bg-black/35 text-white hover:bg-black/50"
  }`;

const swatchInput =
  "size-8 cursor-pointer rounded-full border-2 border-white bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0";

const field =
  "w-full rounded-full bg-black/40 px-4 py-2.5 text-[16px] text-white outline-none backdrop-blur placeholder:text-white/60 focus:ring-2 focus:ring-white/60";

/** Where a typed link goes: https:// is added when left out; null until it looks like a web address. */
function webLink(typed: string) {
  const t = typed.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}


/** Positions without the photo stickers, which only exist in a flattened picture. */
const noPhotos = (positions: StoryPositions) =>
  Object.fromEntries(Object.entries(positions).filter(([k]) => stickerIndex("photo", k as StorySticker) < 0)) as StoryPositions;

/** The stickers that stay live on a story drawn into a picture; the date, time and photos go into the picture. */
const stays = (sticker: StorySticker) => sticker !== "date" && sticker !== "time" && stickerIndex("photo", sticker) < 0;

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
  const [gifs, setGifs] = useState<GifDTO[]>([]);
  const [link, setLink] = useState<{ url: string; label: string } | null>(null);
  const [askLink, setAskLink] = useState(false);
  const [askText, setAskText] = useState("");
  const askField = useRef<HTMLInputElement>(null);
  const askCode = useSession((s) => s.user!.askCode);
  const me = useSession((s) => s.user!.id);
  const linkField = useRef<HTMLInputElement>(null);
  const [asks, setAsks] = useState<AnonMessageDTO[]>(anon ? [anon] : []);
  const [pickingAsks, setPickingAsks] = useState(false);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    if (!panel) return;
    const watch = new ResizeObserver(() => setPanelHeight(panel.offsetHeight));
    watch.observe(panel);
    return () => watch.disconnect();
  }, [panel]);
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
  const [mainStyle, setMainStyle] = useState<WrittenStyle>({ color: EDIT_COLORS[0]!, font: "classic", look: "plain" });
  const [typing, setTyping] = useState(false);
  const styled = mainStyle.color !== EDIT_COLORS[0] || mainStyle.font !== "classic" || mainStyle.look !== "plain";
  const card = useRef<HTMLDivElement>(null);
  const photoPicker = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [flattening, setFlattening] = useState(false);
  const placeField = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = file ? kindFor(file.type) : null;
  const tooLong = kind === "video" && (videoMs ?? 0) > STORY_LIMITS.videoMs + STORY_LIMITS.videoSlackMs;
  const href = link && webLink(link.url);
  const filled = !!file || !!text.trim() || gifs.length > 0 || photos.length > 0 || asks.length > 0 || !!href || askLink || drawn;
  const ready = filled && !tooLong;
  const [shared, setShared] = useState<StoryDraft["shared"]>(initialText ? { bubble, quote } : null);
  const fromChat = !!shared && !file;

  const on = stickersOn({ asks: asks.length, gifs: gifs.length, photos: photos.length, link: !!link, askLink, location: !!location, showDate, showTime });
  const shown = useRef<string[]>([]);
  useLayoutEffect(() => {
    const added = on.filter((k) => !shown.current.includes(k));
    shown.current = on;
    if (added.length) setPositions((p) => landOnTop(p, drawing.texts, added));
  }, [on.join()]);

  const drafts = useStoryDrafts();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [pickingDraft, setPickingDraft] = useState(false);
  const close = () => (filled ? setClosing(true) : onClose());

  async function keepDraft() {
    try {
      await saveDraft({
        id: draftId ?? `${Date.now()}`,
        savedAt: new Date().toISOString(),
        text,
        background,
        mainStyle,
        file,
        photos: photos.map((p) => p.file),
        gifs,
        asks,
        link,
        askLink,
        askText,
        location,
        showDate,
        showTime,
        positions,
        drawing,
        durationSecs,
        shared,
      });
      void qc.invalidateQueries({ queryKey: draftsKey });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function dropDraft() {
    if (draftId) {
      await deleteDraft(draftId).catch(() => null);
      void qc.invalidateQueries({ queryKey: draftsKey });
    }
    onClose();
  }

  function openDraft(d: StoryDraft) {
    shown.current = stickersOn({ asks: d.asks.length, gifs: d.gifs.length, photos: d.photos.length, link: !!d.link, askLink: d.askLink, location: !!d.location, showDate: d.showDate, showTime: d.showTime });
    setDraftId(d.id);
    if (d.file) void pick(d.file);
    setText(d.text);
    setBackground(d.background);
    setMainStyle(d.mainStyle);
    setPhotos(d.photos.map((file) => ({ file, url: URL.createObjectURL(file) })));
    setGifs(d.gifs);
    setAsks(d.asks);
    setLink(d.link);
    setAskLink(d.askLink);
    setAskText(d.askText);
    setLocation(d.location);
    setShowDate(d.showDate);
    setShowTime(d.showTime);
    setPositions(d.positions);
    setDrawing(d.drawing);
    setUndos([]);
    setDurationSecs(d.durationSecs);
    setShared(d.shared);
  }

  /** Once the story is up, the draft it came from goes. */
  const posted = (ok: boolean) => {
    if (!ok || !draftId) return;
    void deleteDraft(draftId)
      .then(() => qc.invalidateQueries({ queryKey: draftsKey }))
      .catch(() => null);
  };
  const covered = !text.trim() && (asks.length > 0 || gifs.length > 0 || photos.length > 0 || !!link || askLink || !!location || showDate || showTime || drawn);

  useEffect(() => {
    if (!file) return setUrl(undefined);
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  const lastPinch = useRef(0);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const fit = (v: number) => Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, v));
    const under = (e: Event) => (e.target as Element).closest<HTMLElement>("[data-pinch]");
    /** Resizes the sticker or text under a trackpad pinch: Chrome and Firefox send it as a wheel with ctrl held, Safari as gestures. */
    const wheel = (e: WheelEvent) => {
      const item = e.ctrlKey ? under(e) : null;
      if (!item) return;
      e.preventDefault();
      resize(item, Math.exp(-e.deltaY / 100), e.timeStamp);
    };
    let pinched = 1;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const gestureStart = (e: Event) => {
      pinched = 1;
      if (under(e)) e.preventDefault();
    };
    const gestureChange = (e: Event) => {
      const item = touch ? null : under(e);
      if (!item) return;
      e.preventDefault();
      const now = (e as Event & { scale: number }).scale;
      resize(item, now / pinched, e.timeStamp);
      pinched = now;
    };
    const resize = (item: HTMLElement, by: number, at: number) => {
      const [kind, key] = item.dataset.pinch!.split(":") as [string, string];
      if (kind === "text") {
        if (at - lastPinch.current > 400) keepRef.current();
        lastPinch.current = at;
        const i = Number(key);
        return setDrawing((d) => ({ ...d, texts: d.texts.map((t, j) => (j === i ? { ...t, scale: fit(t.scale * by) } : t)) }));
      }
      const k = key as StorySticker;
      const box = el.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      setPositions((p) => {
        const spot = p[k] ?? { x: (r.left + r.width / 2 - box.left) / box.width, y: (r.top + r.height / 2 - box.top) / box.height };
        return { ...p, [k]: { ...spot, scale: fit((spot.scale ?? 1) * by) } };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturestart", gestureStart);
    el.addEventListener("gesturechange", gestureChange);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("gesturestart", gestureStart);
      el.removeEventListener("gesturechange", gestureChange);
    };
  }, []);

  useCloseOnBack(() => {
    if (writing) setWriting(null);
    else if (drawingOn) setDrawingOn(false);
    else close();
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
  const keepRef = useRef(keep);
  keepRef.current = keep;
  function finishWriting() {
    const w = writing!;
    setWriting(null);
    const words = w.text.trim();
    if (!words && w.index < 0) return;
    keep();
    const old = drawing.texts[w.index];
    const t = {
      text: words,
      color: w.color,
      font: w.font,
      look: w.look,
      x: old?.x ?? 0.5,
      y: old?.y ?? 0.4,
      scale: old?.scale ?? 1,
      rotate: old?.rotate,
      z: old ? old.z : zToTop(positions, drawing.texts),
    };
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
    if (k === "video") {
      setPhotos([]);
      setPositions(noPhotos);
    }
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

  async function share() {
    if (!ready) return;
    const live = {
      gifIds: gifs.length ? gifs.map((g) => g.id) : undefined,
      link: href ? { url: href, label: link!.label.trim() || undefined } : undefined,
      askLink: askLink || undefined,
      askText: (askLink && askText.trim()) || undefined,
      askIds: asks.length ? asks.map((m) => m.id) : undefined,
      location: location ? { ...location, name: location.name?.trim() || undefined } : undefined,
      showDate,
      showTime,
      positions,
      drawing: drawn ? drawing : undefined,
      durationSecs,
    };
    if (fromChat) {
      const { bubble, quote } = shared!;
      const own = quote?.from.id === me;
      void chatCardJpeg({
        text,
        bubble: bubble ?? `${chatTheme(null).light.bubble},${chatTheme(null).light.bubbleInk}`,
        background,
        from: quote ? (own ? { displayName: "#", avatarUrl: null } : quote.from) : null,
        name: quote ? (own ? tr.common.you : quote.from.displayName) : "",
        when: quote ? `${shortDate(quote.sentAt)} · ${clockTime(quote.sentAt)}` : null,
        label: tr.stories.fromChat,
      }).then((blob) =>
        postStory(qc, { ...live, fromChat: true, messageId: quote?.messageId }, { blob, kind: "image", name: "story.jpg", mime: "image/jpeg" }).then(posted),
      );
      return onClose();
    }
    const flat = kind !== "video" ? await flatten() : null;
    if (flat) {
      void postStory(
        qc,
        {
          gifIds: gifs.length ? gifs.map((g) => g.id) : undefined,
          link: href ? { url: href, label: link!.label.trim() || undefined } : undefined,
          askLink: askLink || undefined,
          askText: (askLink && askText.trim()) || undefined,
          askIds: asks.length ? asks.map((m) => m.id) : undefined,
          location: location ? { ...location, name: location.name?.trim() || undefined } : undefined,
          positions: Object.fromEntries(Object.entries(positions).filter(([k]) => stays(k as StorySticker))),
          durationSecs,
        },
        { blob: flat, kind: "image", name: "story.jpg", mime: "image/jpeg" },
      ).then(posted);
      return onClose();
    }
    const words = text.trim();
    const asDrawn = styled && !file && !fromChat && !!words && words.length <= STORY_LIMITS.drawnText && drawing.texts.length < 10;
    void postStory(
      qc,
      {
        text: asDrawn ? undefined : words || undefined,
        fromChat,
        bubble: fromChat ? shared?.bubble : undefined,
        messageId: fromChat ? shared?.quote?.messageId : undefined,
        background,
        gifIds: gifs.length ? gifs.map((g) => g.id) : undefined,
        link: href ? { url: href, label: link!.label.trim() || undefined } : undefined,
        askLink: askLink || undefined,
        askText: (askLink && askText.trim()) || undefined,
        askIds: asks.length ? asks.map((m) => m.id) : undefined,
        location: location ? { ...location, name: location.name?.trim() || undefined } : undefined,
        showDate,
        showTime,
        positions: noPhotos(positions),
        drawing: asDrawn
          ? { ...drawing, texts: [...drawing.texts, { text: words, ...mainStyle, x: 0.5, y: 0.45, scale: 1, z: zToTop(positions, drawing.texts) }] }
          : drawn
            ? drawing
            : undefined,
        durationSecs,
      },
      file && kind ? { blob: file, kind, name: file.name, mime: file.type } : undefined,
    ).then(posted);
    onClose();
  }

  const stickers = {
    asks: asks.map((m) => ({ text: m.text, prompt: m.prompt, photoUrl: m.photoUrl, gif: m.gif })),
    gifs: gifs.map((g, i) => <img key={i} src={g.previewUrl} alt={g.title} draggable={false} className="max-h-40 max-w-56 rounded-xl" />),
    photos: photos.map((p, i) => <img key={i} src={p.url} alt="" draggable={false} className="max-h-72 max-w-48 rounded-2xl object-cover shadow-lg" />),
    link: href ? { url: href, label: link!.label.trim() || undefined } : null,
    askLink: askLink ? askUrl(window.location.origin, askCode) : null,
    askText: askText.trim() || null,
    location,
    showDate,
    showTime,
    at: new Date().toISOString(),
    positions,
    frame: card,
    onMove: (sticker: StorySticker, spot: StorySpot) => setPositions((p) => ({ ...p, [sticker]: { ...spot, z: zToTop(p, drawing.texts, p[sticker]?.z) } })),
    onRemove: (sticker: StorySticker) => {
      if (stickerIndex("ask", sticker) >= 0) return dropAsk(stickerIndex("ask", sticker));
      if (stickerIndex("gif", sticker) >= 0) {
        const i = stickerIndex("gif", sticker);
        setGifs((g) => g.filter((_, j) => j !== i));
        return setPositions((p) => dropSpot(p, "gif", i));
      }
      if (stickerIndex("photo", sticker) >= 0) {
        const i = stickerIndex("photo", sticker);
        URL.revokeObjectURL(photos[i]!.url);
        setPhotos((ps) => ps.filter((_, j) => j !== i));
        return setPositions((p) => dropSpot(p, "photo", i));
      }
      ({
        location: () => setLocation(null),
        link: () => setLink(null),
        asklink: () => setAskLink(false),
        date: () => setShowDate(false),
        time: () => setShowTime(false),
      })[sticker as "link"]();
      setPositions((p) => {
        const next = { ...p };
        delete next[sticker];
        return next;
      });
    },
    onTap: (sticker: StorySticker) => {
      if (sticker === "location") placeField.current?.focus();
      if (sticker === "link") linkField.current?.focus();
      if (sticker === "asklink") askField.current?.focus();
    },
  };

  function dropAsk(i: number) {
    setAsks((a) => a.filter((_, j) => j !== i));
    setPositions((p) => dropSpot(p, "ask", i));
  }

  /** Puts an anonymous message on the story, or takes it off. */
  function toggleAsk(m: AnonMessageDTO) {
    const at = asks.findIndex((a) => a.id === m.id);
    if (at >= 0) return dropAsk(at);
    if (asks.length >= STORY_ASKS) return;
    setAsks([...asks, m]);
  }

  /** Puts photos from the computer or phone on the story like stickers, up to five. */
  function addPhotos(files: File[]) {
    const picked = files.filter((f) => kindFor(f.type) === "image").slice(0, STORY_PHOTOS - photos.length);
    if (picked.length) setPhotos([...photos, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  /**
   * Draws a picture or text story into one JPEG, everything but the stickers that stay live (link, GIFs, place,
   * anonymous messages) and the tools, which are left out of the capture.
   */
  async function flatten() {
    const node = card.current;
    if (!node) return null;
    setFlattening(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const jpeg = await toJpeg(node, {
        quality: 0.9,
        pixelRatio: 1080 / node.offsetWidth,
        backgroundColor: "#000",
        filter: (n) => !(n instanceof HTMLElement && n.dataset.flatSkip !== undefined),
      });
      return await (await fetch(jpeg)).blob();
    } catch {
      return null;
    } finally {
      setFlattening(false);
    }
  }

  function addGif(g: GifDTO) {
    if (gifs.length < STORY_GIFS) setGifs([...gifs, g]);
  }

  const tools = [
    ...(file ? [{ label: tr.stories.removeMedia, icon: ImageOff, on: false, onClick: () => setFile(null) }] : []),
    { label: `${tr.stories.photo} / ${tr.stories.video}`, icon: ImagePlus, on: !!file, onClick: () => picker.current?.click() },
    { label: tr.composer.camera, icon: Camera, on: false, onClick: () => setCamera(true) },
    ...(kind !== "video" && !fromChat
      ? [{ label: tr.stories.photoSticker, icon: Images, on: photos.length > 0, onClick: () => photoPicker.current?.click() }]
      : []),
    { label: tr.stories.gif, icon: Sticker, on: gifs.length > 0 || pickingGif, onClick: () => setPickingGif(!pickingGif) },
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
  const switches = [
    {
      label: tr.stories.link,
      icon: Link2,
      on: !!link,
      onClick: () => {
        setLink(link ? null : { url: "", label: "" });
        if (!link) setTimeout(() => linkField.current?.focus());
      },
    },
    {
      label: tr.stories.askLink,
      icon: MessageCircleQuestionMark,
      on: askLink,
      onClick: () => {
        setAskLink(!askLink);
        if (!askLink) setTimeout(() => askField.current?.focus());
      },
    },
    { label: tr.ask.title, icon: VenetianMask, on: asks.length > 0 || pickingAsks, onClick: () => setPickingAsks(!pickingAsks) },
    { label: tr.stories.location, icon: locating ? Loader2 : MapPin, on: !!location, onClick: () => void locate() },
    { label: tr.stories.date, icon: CalendarDays, on: showDate, onClick: () => setShowDate(!showDate) },
    { label: tr.stories.time, icon: Clock, on: showTime, onClick: () => setShowTime(!showTime) },
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
              <ChatBubbleCard text={text} bubble={bubble ?? null} quote={quote ?? null} />
            )}
            {flattening && !file && !fromChat && !!text.trim() && (
              <p
                className={`text-center text-2xl leading-snug font-semibold break-words whitespace-pre-wrap ${
                  styled && mainStyle.look === "box" ? "max-w-[80%] rounded-xl px-4 py-1" : "w-full px-16"
                }`}
                style={styled ? writtenStyle(mainStyle) : undefined}
              >
                {text}
              </p>
            )}
            {!flattening && !file && !fromChat && !covered && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={STORY_LIMITS.text}
                autoFocus
                placeholder={tr.stories.typeSomething}
                aria-label={tr.stories.text}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                className={`resize-none bg-transparent text-center text-2xl leading-snug font-semibold outline-none placeholder:text-white/60 ${
                  styled && mainStyle.look === "box" ? "max-w-[80%] rounded-xl px-4 py-1 [field-sizing:content]" : "w-full px-16"
                }`}
                style={styled ? writtenStyle(mainStyle) : undefined}
                rows={4}
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-3 px-16">
              <StoryStickers {...stickers} placed={false} skip={stays} />
              {file && text.trim() && <p className="text-center break-words whitespace-pre-wrap drop-shadow">{text}</p>}
            </div>
          </div>
          <StoryDrawingLayer
            drawing={drawing}
            pen={drawingOn ? pen : null}
            onBegin={keep}
            onChange={setDrawing}
            raise={(z) => zToTop(positions, drawing.texts, z)}
            onEditText={(index) => {
              const t = drawing.texts[index]!;
              setWriting({ index, text: t.text, color: t.color, font: t.font, look: t.look ?? "plain" });
            }}
          >
            <StoryStickers {...stickers} placed onMove={drawingOn ? undefined : stickers.onMove} skip={stays} />
          </StoryDrawingLayer>

          <div
            data-flat-skip
            className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
            style={{ bottom: panelHeight }}
          >
            <button type="button" onClick={close} aria-label={tr.common.close} title={tr.common.close} className={tool(false)}>
              <X className="size-6" />
            </button>
            {!drawingOn && (
              <div className="pointer-events-auto -my-1 mx-2.5 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto flex w-max gap-2.5 py-1">
                  {switches.map(({ label, icon: Icon, on, onClick }) => (
                    <button key={label} type="button" onClick={onClick} aria-label={label} aria-pressed={on} title={label} className={tool(on)}>
                      <Icon className={`size-5 ${Icon === Loader2 ? "animate-spin" : ""}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="pointer-events-auto -m-1 flex max-h-full flex-col gap-2.5 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tools.filter((t) => !drawingOn || t.icon === Pencil).map(({ label, icon: Icon, on, onClick }) => (
                <button key={label} type="button" onClick={onClick} aria-label={label} aria-pressed={on} title={label} className={tool(on)}>
                  <Icon className={`size-5 ${Icon === Loader2 ? "animate-spin" : ""}`} />
                </button>
              ))}
            </div>
          </div>

          <div
            ref={setPanel}
            data-flat-skip
            className="relative flex flex-col gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
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
            {!file && !drawingOn && typing && !covered && <TextStyler value={mainStyle} onChange={setMainStyle} />}
            {!file && !drawingOn && (!typing || covered) && (
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
            {askLink && (
              <input
                ref={askField}
                value={askText}
                onChange={(e) => setAskText(e.target.value)}
                maxLength={ASK_PROMPT_MAX}
                placeholder={tr.ask.prompt}
                aria-label={tr.stories.askText}
                className={field}
              />
            )}
            {link && (
              <div className="flex gap-2">
                <input
                  ref={linkField}
                  value={link.url}
                  onChange={(e) => setLink({ ...link, url: e.target.value })}
                  type="url"
                  inputMode="url"
                  maxLength={2000}
                  placeholder={tr.stories.linkUrl}
                  aria-label={tr.stories.linkUrl}
                  className={`${field} min-w-0 flex-[3]`}
                />
                <input
                  value={link.label}
                  onChange={(e) => setLink({ ...link, label: e.target.value })}
                  maxLength={40}
                  placeholder={tr.stories.linkLabel}
                  aria-label={tr.stories.linkLabel}
                  className={`${field} min-w-0 flex-[2]`}
                />
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
              {!filled && !!drafts.data?.length && (
                <button
                  type="button"
                  onClick={() => setPickingDraft(true)}
                  className="flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-2.5 text-sm font-medium backdrop-blur hover:bg-black/55"
                >
                  <FileClock className="size-4" />
                  {tr.stories.drafts} ({drafts.data.length})
                </button>
              )}
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
          {pickingAsks && <AskPicker picked={asks.map((m) => m.id)} onToggle={toggleAsk} onClose={() => setPickingAsks(false)} />}
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
                    addGif(g);
                    setPickingGif(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <input
          ref={photoPicker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addPhotos([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
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
      {closing && (
        <Sheet
          title={tr.stories.keepForLater}
          actions={[
            { label: tr.stories.saveDraft, onSelect: () => void keepDraft() },
            { label: draftId ? tr.stories.deleteDraft : tr.stories.discard, onSelect: () => void dropDraft(), destructive: true },
          ]}
          onClose={() => setClosing(false)}
        />
      )}
      {pickingDraft && (
        <Sheet
          title={tr.stories.drafts}
          actions={(drafts.data ?? []).map((d) => ({
            label: `${d.text.trim().slice(0, 40) || (d.file?.type.startsWith("video/") ? tr.stories.video : d.file ? tr.stories.photo : tr.stories.newStory)} · ${timeAgo(d.savedAt)}`,
            onSelect: () => openDraft(d),
          }))}
          onClose={() => setPickingDraft(false)}
        />
      )}
      {cutting && file && <VideoTrimmer file={file} onCancel={() => setCutting(false)} onDone={(from, to) => void cut(from, to)} />}
    </Portal>
  );
}

/** Shows a card once it scrolls near the picker's view, so its photo or GIF only loads then. */
function LazyCard({ children }: { children: React.ReactNode }) {
  const [near, setNear] = useState(false);
  const spot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (near || !spot.current) return;
    const watch = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "0px 300px" });
    watch.observe(spot.current);
    return () => watch.disconnect();
  }, [near]);
  return near ? children : <div ref={spot} className="h-48 w-64 animate-pulse rounded-3xl bg-stone-200 dark:bg-stone-800" />;
}

/** The anonymous messages you received that can go on a story, as their cards in a row to swipe through and tick up to five of, each once. */
function AskPicker({ picked, onToggle, onClose }: { picked: string[]; onToggle: (m: AnonMessageDTO) => void; onClose: () => void }) {
  const tr = useT();
  const inbox = useInfiniteQuery({
    queryKey: ["ask"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrap(await six.api.GET("/v1/ask", { params: { query: { limit: 30, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = (inbox.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.text.trim() || m.photoUrl || m.gif);
  const full = picked.length >= STORY_ASKS;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col rounded-t-3xl bg-white pt-2 text-stone-900 shadow-2xl dark:bg-stone-900 dark:text-stone-100">
      <button type="button" onClick={onClose} aria-label={tr.common.close} className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-stone-300 dark:bg-stone-700" />
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <h2 className="font-semibold">{tr.ask.title}</h2>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {picked.length}/{STORY_ASKS}
        </span>
      </div>
      <div
        className="flex min-h-0 snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-contain scroll-px-4 px-4 pt-1 pb-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollLeft + el.clientWidth > el.scrollWidth - 300 && inbox.hasNextPage && !inbox.isFetchingNextPage) void inbox.fetchNextPage();
        }}
      >
        {inbox.isPending ? (
          <p className="w-full py-8 text-center text-sm text-stone-500">{tr.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="w-full py-8 text-center text-sm text-stone-500">{tr.ask.empty}</p>
        ) : (
          items.map((m) => {
            const on = picked.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onToggle(m)}
                className={`relative shrink-0 snap-start rounded-[1.75rem] p-1 transition active:scale-[0.98] disabled:opacity-40 ${on ? "ring-3 ring-brand" : ""}`}
              >
                <LazyCard>
                  <AskCard ask={m} />
                </LazyCard>
                <span
                  className={`absolute top-3 right-3 grid size-7 place-items-center rounded-full ring-2 ring-white ${on ? "bg-brand text-brand-ink" : "bg-black/35"}`}
                >
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            );
          })
        )}
        {inbox.isFetchingNextPage && <p className="shrink-0 self-center px-6 text-sm text-stone-500">{tr.common.loading}</p>}
      </div>
      <div className="border-t border-stone-100 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-stone-800">
        <PrimaryButton type="button" onClick={onClose} className="w-full">
          {tr.common.done}
        </PrimaryButton>
      </div>
    </div>
  );
}
