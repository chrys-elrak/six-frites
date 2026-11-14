import { unwrap } from "@six/sdk";
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
} from "@six/shared";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  CalendarDays,
  Camera,
  CaseSensitive,
  FileClock,
  Check,
  ClipboardPaste,
  ChevronDown,
  Clock,
  Hourglass,
  ImageOff,
  Link2,
  MessageCircleQuestionMark,
  ImagePlus,
  Images,
  MapPin,
  Pencil,
  Scissors,
  SendHorizontal,
  Sticker,
  VenetianMask,
  Video,
  X,
} from "lucide-react-native";
import { type ComponentRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, type GestureResponderEvent, Keyboard, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { captureRef } from "react-native-view-shot";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocale, useT } from "@/lib/i18n";
import { cutVideo, pickMedia, recordVideo, takePhoto } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useSession } from "@/lib/session";
import { WEB_URL, six } from "@/lib/six";
import { postStory } from "@/lib/story-post";
import { type StoryDraft, deleteDraft, draftsKey, saveDraft, useStoryDrafts } from "@/lib/story-drafts";
import { timeAgo } from "@/lib/format";
import { brand, brandInk } from "@/lib/theme";
import { currentPosition } from "./location-card";
import { Modal } from "./modal";
import { Sheet } from "./sheet";
import { AskCard, ChatBubbleCard, StoryStickers, backgroundAround, storyFill } from "./stories";
import { LastsPicker } from "./notes";
import { DrawBar, type Pen, StoryDrawingLayer, TextStyler, TextWriter, type Writing, type WrittenStyle, writtenStyle } from "./story-drawing";
import { Text, TextInput } from "./text";
import { VideoTrimmer } from "./video-trimmer";

/** Where a typed link goes: https:// is added when left out; null until it looks like a web address. */
function webLink(typed: string) {
  const t = typed.trim();
  if (!/^(https?:\/\/)?[^\s/.]+\.[^\s/]+/i.test(t)) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}


function Tool({ on, Icon, label, busy, onPress }: { on: boolean; Icon: typeof X; label: string; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={4}
      style={({ pressed }) => [styles.tool, { backgroundColor: on ? "#fff" : "rgba(0,0,0,0.35)", opacity: pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={on ? "#1c1917" : "#fff"} /> : <Icon size={20} color={on ? "#1c1917" : "#fff"} />}
    </Pressable>
  );
}

const HUES = "linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

/** The colour at `hue` (0 to 360) and `light` (0 black, 0.5 the pure colour, 1 white), as #rrggbb. */
function hslHex(hue: number, light: number) {
  const a = Math.min(light, 1 - light);
  const part = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round((light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

function Bar({ fill, at, onPick }: { fill: string; at: number; onPick: (x: number) => void }) {
  const [width, setWidth] = useState(1);
  const pick = (e: GestureResponderEvent) => onPick(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      style={[styles.bar, { backgroundImage: fill }]}
    >
      <View pointerEvents="none" style={[styles.knob, { left: at * width - 11 }]} />
    </View>
  );
}

/** Picks any colour: a hue, then how dark or light, by tapping or dragging along two bars. */
export function ColorPicker({ onChange }: { onChange: (hex: string) => void }) {
  const [hue, setHue] = useState(30);
  const [light, setLight] = useState(0.5);
  return (
    <View style={{ flex: 1, gap: 12 }}>
      <Bar
        fill={HUES}
        at={hue / 360}
        onPick={(x) => {
          setHue(x * 360);
          onChange(hslHex(x * 360, light));
        }}
      />
      <Bar
        fill={`linear-gradient(90deg, #000, ${hslHex(hue, 0.5)}, #fff)`}
        at={light}
        onPick={(x) => {
          setLight(x);
          onChange(hslHex(hue, x));
        }}
      />
    </View>
  );
}

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

export function GifSearch({ onPick }: { onPick: (gif: GifDTO) => void }) {
  const tr = useT();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 400);
    return () => clearTimeout(timer);
  }, [input]);
  const gifs = useQuery({
    queryKey: ["gifs", "gif", q],
    queryFn: async () => unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, kind: "gif" } } })),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const items = gifs.data?.items ?? [];
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={input}
        onChangeText={setInput}
        autoFocus
        placeholder={tr.ask.searchGifs}
        placeholderTextColor="rgba(255,255,255,0.5)"
        accessibilityLabel={tr.ask.searchGifs}
        style={styles.field}
      />
      {items.length ? (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} accessibilityLabel={item.title}>
              <Image source={{ uri: item.previewUrl }} style={{ height: 96, width: (96 * item.width) / item.height, borderRadius: 8 }} />
            </Pressable>
          )}
        />
      ) : (
        <Text style={styles.dim}>
          {gifs.isError ? tr.composer.couldNotLoadGifs : gifs.data ? tr.composer.noGifs : tr.common.loading}
        </Text>
      )}
    </View>
  );
}

/**
 * Makes a story: text on a colour, or a photo or video, with a GIF, the place, the date or the time on top. With
 * `anon`, it starts with that anonymous message on it as a card, to answer in front of everyone.
 */
/** The stickers that stay live on a story drawn into a picture; the date and time go into the picture. */
/** Positions without the photo stickers, which only exist in a flattened picture. */
const noPhotos = (positions: StoryPositions) =>
  Object.fromEntries(Object.entries(positions).filter(([k]) => stickerIndex("photo", k as StorySticker) < 0)) as StoryPositions;

const live = (sticker: StorySticker) => sticker !== "date" && sticker !== "time" && stickerIndex("photo", sticker) < 0;

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
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const screen = useRef<ComponentRef<typeof View>>(null);
  const [flattening, setFlattening] = useState(false);
  const [file, setFile] = useState<LocalFile | null>(null);
  const [text, setText] = useState(initialText ?? "");
  const [background, setBackground] = useState<string>(initialText ? backgroundAround(bubble) : STORY_BACKGROUNDS[0]);
  const [custom, setCustom] = useState(false);
  const [from, to] = background.split(",") as [string, string | undefined];
  const [gifs, setGifs] = useState<GifDTO[]>([]);
  const [link, setLink] = useState<{ url: string; label: string } | null>(null);
  const [askLink, setAskLink] = useState(false);
  const [askText, setAskText] = useState("");
  const askField = useRef<ComponentRef<typeof TextInput>>(null);
  const askCode = useSession((s) => s.user!.askCode);
  const linkField = useRef<ComponentRef<typeof TextInput>>(null);
  const [asks, setAsks] = useState<AnonMessageDTO[]>(anon ? [anon] : []);
  const [pickingAsks, setPickingAsks] = useState(false);
  const [panelTop, setPanelTop] = useState(screenH);
  const [pickingGif, setPickingGif] = useState(false);
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
  const card = useRef<ComponentRef<typeof View>>(null);
  const placeField = useRef<ComponentRef<typeof TextInput>>(null);
  const [error, setError] = useState<string | null>(null);
  const tooLong = file?.kind === "video" && (file.durationMs ?? 0) > STORY_LIMITS.videoMs + STORY_LIMITS.videoSlackMs;
  const href = link && webLink(link.url);
  const [photos, setPhotos] = useState<LocalFile[]>([]);
  const [mainStyle, setMainStyle] = useState<WrittenStyle>({ color: EDIT_COLORS[0]!, font: "classic", look: "plain" });
  const [typing, setTyping] = useState(false);
  const styled = mainStyle.color !== EDIT_COLORS[0] || mainStyle.font !== "classic" || mainStyle.look !== "plain";
  const mainText = [styles.bigInput, styled && writtenStyle(mainStyle), styled && mainStyle.look === "box" && styles.boxed];
  const filled = !!file || !!text.trim() || gifs.length > 0 || photos.length > 0 || asks.length > 0 || !!href || askLink || drawn;
  const ready = filled && !tooLong;
  const [shared, setShared] = useState<StoryDraft["shared"]>(initialText ? { bubble, quote } : null);
  const fromChat = !!shared && !file;
  const covered = !text.trim() && (asks.length > 0 || gifs.length > 0 || photos.length > 0 || !!link || askLink || !!location || showDate || showTime || drawn);
  const keyboardUp = useKeyboardState((k) => k.isVisible);
  const styling = typing && keyboardUp && !covered;

  const on = stickersOn({ asks: asks.length, gifs: gifs.length, photos: photos.length, link: !!link, askLink, location: !!location, showDate, showTime });
  const shown = useRef<string[]>([]);
  const [focus, setFocus] = useState<StorySticker | number | null>(null);
  const hit = useRef(false);
  useLayoutEffect(() => {
    const added = on.filter((k) => !shown.current.includes(k));
    shown.current = on;
    if (added.length) setPositions((p) => landOnTop(p, drawing.texts, added));
    if (added.length) setFocus(added.at(-1)!);
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
        photos,
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

  function dropDraft() {
    if (draftId) {
      deleteDraft(draftId);
      void qc.invalidateQueries({ queryKey: draftsKey });
    }
    onClose();
  }

  function openDraft(d: StoryDraft) {
    shown.current = stickersOn({ asks: d.asks.length, gifs: d.gifs.length, photos: d.photos.length, link: !!d.link, askLink: d.askLink, location: !!d.location, showDate: d.showDate, showTime: d.showTime });
    setDraftId(d.id);
    setText(d.text);
    setBackground(d.background);
    setMainStyle(d.mainStyle);
    setFile(d.file);
    setPhotos(d.photos);
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
    deleteDraft(draftId);
    void qc.invalidateQueries({ queryKey: draftsKey });
  };

  const keep = () => setUndos((u) => [...u, drawing]);
  function finishWriting() {
    const w = writing!;
    setWriting(null);
    const words = w.text.trim();
    if (!words && w.index < 0) return;
    setFocus(!words ? null : w.index < 0 ? drawing.texts.length : w.index);
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

  async function pick(from: "library" | "camera" | "video") {
    setError(null);
    try {
      const [picked] =
        from === "camera"
          ? await takePhoto()
          : from === "video"
            ? await recordVideo(STORY_LIMITS.videoMs / 1000)
            : await pickMedia(["images", "videos"]);
      if (picked && (picked.kind === "image" || picked.kind === "video")) setFile(picked);
      if (picked?.kind === "video") {
        setPhotos([]);
        setPositions(noPhotos);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => {
    const check = () => void Clipboard.hasImageAsync().then(setCanPaste, () => null);
    check();
    const sub = Clipboard.addClipboardListener(check);
    return () => sub.remove();
  }, []);

  async function paste() {
    setError(null);
    try {
      const img = await Clipboard.getImageAsync({ format: "png" });
      if (!img) return setCanPaste(false);
      const out = new File(Paths.cache, `pasted-${Date.now()}.png`);
      out.write(img.data.slice(img.data.indexOf(",") + 1), { encoding: "base64" });
      setFile({ uri: out.uri, kind: "image", name: out.name, mime: "image/png", size: out.size, width: img.size.width, height: img.size.height });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function cut(from: number, to: number) {
    setCutting(false);
    const out = file && (await cutVideo(file, from, to));
    if (!out) return setError(tr.composer.cantCut);
    setFile(out);
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

  /**
   * Draws a picture or text story into one JPEG, everything but the stickers that stay live (link, GIFs, place,
   * anonymous messages): the tools and those stickers hide for a frame while the screen is captured.
   */
  async function flatten() {
    Keyboard.dismiss();
    setFlattening(true);
    await new Promise((r) => setTimeout(r, 350));
    try {
      const uri = await captureRef(screen, {
        format: "jpg",
        quality: 0.9,
        result: "tmpfile",
        width: 1080,
        height: Math.round((1080 * screenH) / screenW),
      });
      return { uri, kind: "image" as const, name: "story.jpg", mime: "image/jpeg" };
    } catch {
      return null;
    } finally {
      setFlattening(false);
    }
  }

  async function share() {
    if (!ready) return;
    const flat = file?.kind !== "video" ? await flatten() : null;
    if (flat) {
      void postStory(
        qc,
        {
          fromChat: fromChat || undefined,
          messageId: fromChat ? shared?.quote?.messageId : undefined,
          gifIds: gifs.length ? gifs.map((g) => g.id) : undefined,
          link: href ? { url: href, label: link!.label.trim() || undefined } : undefined,
          askLink: askLink || undefined,
          askText: (askLink && askText.trim()) || undefined,
          askIds: asks.length ? asks.map((m) => m.id) : undefined,
          location: location ? { ...location, name: location.name?.trim() || undefined } : undefined,
          positions: Object.fromEntries(Object.entries(positions).filter(([k]) => live(k as StorySticker))),
          durationSecs,
        },
        flat,
      ).then(posted);
      return onClose();
    }
    const words = text.trim();
    const asDrawn = styled && !file && !fromChat && !!words && words.length <= STORY_LIMITS.drawnText && drawing.texts.length < 10;
    const drawnMain = asDrawn
      ? { ...drawing, texts: [...drawing.texts, { text: words, ...mainStyle, x: 0.5, y: 0.45, scale: 1, z: zToTop(positions, drawing.texts) }] }
      : drawing;
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
        drawing: drawn || asDrawn ? drawnMain : undefined,
        durationSecs,
      },
      file ? { uri: file.uri, kind: file.kind, name: file.name, mime: file.mime } : undefined,
    ).then(posted);
    onClose();
  }

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

  /** Puts photos from the phone on the story like stickers, up to five. */
  async function addPhotos() {
    setError(null);
    try {
      const picked = (await pickMedia(["images"])).filter((p) => p.kind === "image").slice(0, STORY_PHOTOS - photos.length);
      if (picked.length) setPhotos([...photos, ...picked]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addGif(g: GifDTO) {
    if (gifs.length < STORY_GIFS) setGifs([...gifs, g]);
  }

  const stickers = {
    asks: asks.map((m) => ({ text: m.text, prompt: m.prompt, photoUrl: m.photoUrl, gif: m.gif })),
    gifs: gifs.map((g, i) => <Image key={i} source={{ uri: g.previewUrl }} style={{ height: 120, width: (120 * g.width) / g.height, borderRadius: 10 }} />),
    photos: photos.map((p, i) => (
      <Image
        key={i}
        source={{ uri: p.uri }}
        style={{ width: 180, height: p.width && p.height ? Math.min(320, (180 * p.height) / p.width) : 180, borderRadius: 14 }}
        contentFit="cover"
      />
    )),
    link: href ? { url: href, label: link!.label.trim() || undefined } : null,
    askLink: askLink ? askUrl(WEB_URL, askCode) : null,
    askText: askText.trim() || null,
    location,
    showDate,
    showTime,
    at: new Date().toISOString(),
    positions,
    frame: card,
    focused: typeof focus === "string" && !flattening ? focus : null,
    onTouch: () => {
      hit.current = true;
    },
    onMove: (sticker: StorySticker, spot: StorySpot) => {
      setFocus(sticker);
      setPositions((p) => ({ ...p, [sticker]: { ...spot, z: zToTop(p, drawing.texts, p[sticker]?.z) } }));
    },
    onRemove: (sticker: StorySticker) => {
      if (stickerIndex("ask", sticker) >= 0) return dropAsk(stickerIndex("ask", sticker));
      if (stickerIndex("gif", sticker) >= 0) {
        const i = stickerIndex("gif", sticker);
        setGifs((g) => g.filter((_, j) => j !== i));
        return setPositions((p) => dropSpot(p, "gif", i));
      }
      if (stickerIndex("photo", sticker) >= 0) {
        const i = stickerIndex("photo", sticker);
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
      setFocus((f) => (f === sticker ? null : sticker));
      if (sticker === "location") placeField.current?.focus();
      if (sticker === "link") linkField.current?.focus();
      if (sticker === "asklink") askField.current?.focus();
    },
  };

  return (
    <Modal
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (writing ? setWriting(null) : drawingOn ? setDrawingOn(false) : close())}
    >
      <View
        ref={screen}
        collapsable={false}
        style={styles.screen}
        onTouchStart={() => {
          if (!hit.current) setFocus(null);
          hit.current = false;
        }}
      >
        <KeyboardAvoidingView behavior="padding" style={[styles.screen, file ? { backgroundColor: "#000" } : storyFill(background)]}>
          <View ref={card} pointerEvents="none" style={StyleSheet.absoluteFill} />
          <View style={styles.preview}>
            {file?.kind === "image" && <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />}
            {file?.kind === "video" && <PreviewVideo uri={file.uri} />}
            {fromChat && (
              <ChatBubbleCard text={text} bubble={shared?.bubble ?? null} quote={shared?.quote ?? null} />
            )}
            {flattening && !file && !fromChat && !!text.trim() && <Text style={mainText}>{text}</Text>}
            {!flattening && !file && !fromChat && !covered && (
              <TextInput
                value={text}
                onChangeText={setText}
                maxLength={STORY_LIMITS.text}
                multiline
                autoFocus
                placeholder={tr.stories.typeSomething}
                placeholderTextColor="rgba(255,255,255,0.6)"
                accessibilityLabel={tr.stories.text}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                style={mainText}
              />
            )}
            <View pointerEvents="box-none" style={styles.overlay}>
              <StoryStickers {...stickers} placed={false} skip={flattening ? live : undefined} />
              {!!file && !!text.trim() && <Text style={styles.caption}>{text}</Text>}
            </View>
          </View>
          <StoryDrawingLayer
            drawing={drawing}
            pen={drawingOn ? pen : null}
            onBegin={keep}
            onChange={flattening ? undefined : setDrawing}
            focusedText={typeof focus === "number" ? focus : null}
            onTouchText={(i) => {
              hit.current = true;
              setFocus(i);
            }}
            raise={(z) => zToTop(positions, drawing.texts, z)}
            onEditText={(index) => {
              const t = drawing.texts[index]!;
              setWriting({ index, text: t.text, color: t.color, font: t.font, look: t.look ?? "plain" });
            }}
          >
            <StoryStickers {...stickers} placed onMove={drawingOn ? undefined : stickers.onMove} skip={flattening ? live : undefined} />
          </StoryDrawingLayer>

          <View pointerEvents="box-none" style={[styles.top, { top: insets.top + 8 }, flattening && styles.gone]}>
            <Tool on={false} Icon={X} label={tr.common.close} onPress={close} />
            {!drawingOn && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switches} contentContainerStyle={styles.switchRow}>
                <Tool
                  on={!!link}
                  Icon={Link2}
                  label={tr.stories.link}
                  onPress={() => {
                    setLink(link ? null : { url: "", label: "" });
                    if (!link) setTimeout(() => linkField.current?.focus(), 50);
                  }}
                />
                <Tool
                  on={askLink}
                  Icon={MessageCircleQuestionMark}
                  label={tr.stories.askLink}
                  onPress={() => {
                    setAskLink(!askLink);
                    if (!askLink) setTimeout(() => askField.current?.focus(), 50);
                  }}
                />
                <Tool on={asks.length > 0 || pickingAsks} Icon={VenetianMask} label={tr.ask.title} onPress={() => setPickingAsks(!pickingAsks)} />
                <Tool on={!!location} busy={locating} Icon={MapPin} label={tr.stories.location} onPress={() => void locate()} />
                <Tool on={showDate} Icon={CalendarDays} label={tr.stories.date} onPress={() => setShowDate(!showDate)} />
                <Tool on={showTime} Icon={Clock} label={tr.stories.time} onPress={() => setShowTime(!showTime)} />
              </ScrollView>
            )}
            <ScrollView
              style={{ maxHeight: Math.max(0, panelTop - insets.top - 8 - 12), flexGrow: 0 }}
              contentContainerStyle={styles.tools}
              showsVerticalScrollIndicator={false}
            >
              {!drawingOn && (
                <>
                  {file && <Tool on={false} Icon={ImageOff} label={tr.stories.removeMedia} onPress={() => setFile(null)} />}
                  <Tool on={!!file} Icon={ImagePlus} label={`${tr.stories.photo} / ${tr.stories.video}`} onPress={() => void pick("library")} />
                  <Tool on={false} Icon={Camera} label={tr.stories.photo} onPress={() => void pick("camera")} />
                  <Tool on={false} Icon={Video} label={tr.stories.video} onPress={() => void pick("video")} />
                  {file?.kind !== "video" && !fromChat && (
                    <Tool on={photos.length > 0} Icon={Images} label={tr.stories.photoSticker} onPress={() => void addPhotos()} />
                  )}
                  {canPaste && <Tool on={false} Icon={ClipboardPaste} label={tr.stories.pasteImage} onPress={() => void paste()} />}
                  <Tool on={gifs.length > 0 || pickingGif} Icon={Sticker} label={tr.stories.gif} onPress={() => setPickingGif(!pickingGif)} />
                </>
              )}
              <Tool on={drawingOn} Icon={Pencil} label={tr.composer.editTools.draw} onPress={() => setDrawingOn(!drawingOn)} />
              {!drawingOn && (
                <Tool
                  on={false}
                  Icon={CaseSensitive}
                  label={tr.stories.addText}
                  onPress={() => {
                    setDrawingOn(false);
                    if (drawing.texts.length < 10) setWriting({ index: -1, text: "", color: EDIT_COLORS[0]!, font: "classic", look: "plain" });
                  }}
                />
              )}
            </ScrollView>
          </View>

          <View
            onLayout={(e) => setPanelTop(e.nativeEvent.layout.y)}
            style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }, flattening && styles.gone]}
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
            {pickingAsks && <AskPicker picked={asks.map((m) => m.id)} onToggle={toggleAsk} onClose={() => setPickingAsks(false)} />}
            {pickingGif && (
              <View style={styles.gifs}>
                <GifSearch
                  onPick={(g) => {
                    addGif(g);
                    setPickingGif(false);
                  }}
                />
              </View>
            )}
            {!file && custom && (
              <View style={styles.custom}>
                <View style={styles.customRow}>
                  <View style={[styles.dot, { backgroundColor: from }]} />
                  <ColorPicker onChange={(c) => setBackground(to ? `${c},${to}` : c)} />
                </View>
                <Pressable
                  onPress={() => setBackground(to ? from : `${from},${from === "#7c3aed" ? "#e11d48" : "#7c3aed"}`)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !!to }}
                  style={({ pressed }) => [styles.toggle, to ? styles.toggleOn : styles.toggleOff, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <View style={[styles.check, { backgroundImage: `linear-gradient(135deg, ${from}, ${to ?? "#7c3aed"})`, opacity: to ? 1 : 0.6 }]} />
                  <Text style={{ color: to ? "#1c1917" : "#fff", fontSize: 14, fontWeight: "600" }}>{tr.stories.gradient}</Text>
                </Pressable>
                {to && (
                  <View style={styles.customRow}>
                    <View style={[styles.dot, { backgroundColor: to }]} />
                    <ColorPicker onChange={(c) => setBackground(`${from},${c}`)} />
                  </View>
                )}
              </View>
            )}
            {!file && !drawingOn && styling && <TextStyler value={mainStyle} onChange={setMainStyle} />}
            {!file && !drawingOn && !styling && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
                <View accessibilityRole="radiogroup" accessibilityLabel={tr.stories.background} style={styles.swatchRow}>
                  {STORY_BACKGROUNDS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => {
                        setBackground(c);
                        setCustom(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: background === c && !custom }}
                      accessibilityLabel={c}
                      hitSlop={4}
                      style={[styles.swatch, storyFill(c), background === c && !custom && styles.swatchOn]}
                    />
                  ))}
                  <Pressable
                    onPress={() => setCustom(!custom)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.stories.customColour}
                    accessibilityState={{ selected: custom }}
                    hitSlop={4}
                    style={[styles.swatch, { backgroundImage: "linear-gradient(135deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f)" }, custom && styles.swatchOn]}
                  />
                </View>
              </ScrollView>
            )}
            {askLink && (
              <TextInput
                ref={askField}
                value={askText}
                onChangeText={setAskText}
                maxLength={ASK_PROMPT_MAX}
                placeholder={tr.ask.prompt}
                placeholderTextColor="rgba(255,255,255,0.6)"
                accessibilityLabel={tr.stories.askText}
                style={styles.field}
              />
            )}
            {link && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  ref={linkField}
                  value={link.url}
                  onChangeText={(url) => setLink({ ...link, url })}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={2000}
                  placeholder={tr.stories.linkUrl}
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  accessibilityLabel={tr.stories.linkUrl}
                  style={[styles.field, { flex: 3 }]}
                />
                <TextInput
                  value={link.label}
                  onChangeText={(label) => setLink({ ...link, label })}
                  maxLength={40}
                  placeholder={tr.stories.linkLabel}
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  accessibilityLabel={tr.stories.linkLabel}
                  style={[styles.field, { flex: 2 }]}
                />
              </View>
            )}
            {location && (
              <TextInput
                ref={placeField}
                value={location.name ?? ""}
                onChangeText={(name) => setLocation({ ...location, name })}
                maxLength={STORY_LIMITS.place}
                placeholder={tr.stories.placeName}
                placeholderTextColor="rgba(255,255,255,0.6)"
                accessibilityLabel={tr.stories.placeName}
                style={styles.field}
              />
            )}
            {file && (
              <TextInput
                value={text}
                onChangeText={setText}
                maxLength={STORY_LIMITS.text}
                placeholder={tr.stories.caption}
                placeholderTextColor="rgba(255,255,255,0.6)"
                accessibilityLabel={tr.stories.caption}
                style={styles.field}
              />
            )}
            {tooLong && (
              <View style={styles.warn}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 14 }}>{tr.stories.videoTooLong}</Text>
                <Pressable onPress={() => setCutting(true)} accessibilityRole="button" style={styles.cut}>
                  <Scissors size={16} color="#1c1917" />
                  <Text style={{ color: "#1c1917", fontSize: 14, fontWeight: "600" }}>{tr.composer.cut}</Text>
                </Pressable>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.actions}>
              {!filled && !!drafts.data?.length && (
                <Pressable onPress={() => setPickingDraft(true)} accessibilityRole="button" style={styles.pill}>
                  <FileClock size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                    {tr.stories.drafts} ({drafts.data.length})
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setPickingDuration(true)}
                accessibilityRole="button"
                accessibilityLabel={`${tr.stories.lasts} ${durationLabel(durationSecs, tr)}`}
                style={styles.pill}
              >
                <Hourglass size={16} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{durationLabel(durationSecs, tr)}</Text>
                <ChevronDown size={16} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <Pressable
                onPress={share}
                disabled={!ready}
                accessibilityRole="button"
                style={({ pressed }) => [styles.share, { opacity: !ready ? 0.5 : pressed ? 0.85 : 1 }]}
              >
                <Text style={{ color: brandInk, fontSize: 16, fontWeight: "700" }}>
                  {tr.stories.post}
                </Text>
                <SendHorizontal size={18} color={brandInk} />
              </Pressable>
            </View>
          </View>
          {writing && (
            <TextWriter
              writing={writing}
              onChange={setWriting}
              onDone={finishWriting}
              onRemove={
                writing.index >= 0
                  ? () => {
                      keep();
                      setFocus(null);
                      setDrawing((d) => ({ ...d, texts: d.texts.filter((_, i) => i !== writing.index) }));
                      setWriting(null);
                    }
                  : undefined
              }
            />
          )}
        </KeyboardAvoidingView>
      </View>
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
      {customDuration && <LastsPicker value={durationSecs} onSet={setDurationSecs} onClose={() => setCustomDuration(false)} />}
      {closing && (
        <Sheet
          title={tr.stories.keepForLater}
          actions={[
            { label: tr.stories.saveDraft, onSelect: () => void keepDraft() },
            { label: draftId ? tr.stories.deleteDraft : tr.stories.discard, onSelect: dropDraft, destructive: true },
          ]}
          onClose={() => setClosing(false)}
        />
      )}
      {pickingDraft && (
        <Sheet
          title={tr.stories.drafts}
          actions={(drafts.data ?? []).map((d) => ({
            label: `${d.text.trim().slice(0, 40) || (d.file?.kind === "video" ? tr.stories.video : d.file ? tr.stories.photo : tr.stories.newStory)} · ${timeAgo(d.savedAt)}`,
            onSelect: () => openDraft(d),
          }))}
          onClose={() => setPickingDraft(false)}
        />
      )}
      {cutting && file && <VideoTrimmer file={file} onCancel={() => setCutting(false)} onDone={(from, to) => void cut(from, to)} />}
    </Modal>
  );
}

const ASK_WIDTH = 262;
const ASK_GAP = 12;

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
  const { width } = useWindowDimensions();

  return (
    <View style={styles.asks}>
      <View style={styles.asksHead}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{tr.ask.title}</Text>
        <Text style={styles.asksCount}>
          {picked.length}/{STORY_ASKS}
        </Text>
      </View>
      {inbox.isPending ? (
        <ActivityIndicator color="#fff" style={{ paddingVertical: 24 }} />
      ) : (
        <FlatList
          data={items}
          horizontal
          keyExtractor={(m) => m.id}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: ASK_GAP, alignItems: "flex-start" }}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ASK_WIDTH + ASK_GAP}
          decelerationRate="fast"
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          onEndReachedThreshold={2}
          onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && void inbox.fetchNextPage()}
          ListFooterComponent={inbox.isFetchingNextPage ? <ActivityIndicator color="#fff" style={{ alignSelf: "center", padding: 24 }} /> : undefined}
          ListEmptyComponent={<Text style={{ width: width - 56, color: "rgba(255,255,255,0.7)", textAlign: "center", paddingVertical: 24 }}>{tr.ask.empty}</Text>}
          renderItem={({ item: m }) => {
            const on = picked.includes(m.id);
            return (
              <Pressable
                onPress={() => onToggle(m)}
                disabled={!on && full}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !on && full }}
                style={({ pressed }) => [styles.askSlide, on && { borderColor: brand }, !on && full && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }]}
              >
                <AskCard ask={m} id={`pick-${m.id}`} />
                <View style={[styles.askTick, on && { backgroundColor: brand, borderColor: brand }]}>
                  {on && <Check size={15} color={brandInk} strokeWidth={3} />}
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.askDone, pressed && { opacity: 0.85 }]}>
        <Text style={{ color: brandInk, fontSize: 15, fontWeight: "700" }}>{tr.common.done}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gone: { opacity: 0 },
  preview: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bigInput: { width: "100%", color: "#fff", fontSize: 26, lineHeight: 34, fontWeight: "700", textAlign: "center", paddingHorizontal: 64 },
  boxed: { width: "auto", maxWidth: "80%", alignSelf: "center", paddingHorizontal: 14, paddingVertical: 4 },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 10, paddingHorizontal: 64, paddingBottom: 12 },
  caption: { color: "#fff", fontSize: 16, textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  top: { position: "absolute", left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tools: { gap: 10 },
  switches: { flex: 1, marginHorizontal: 10 },
  switchRow: { flexGrow: 1, justifyContent: "center", gap: 10 },
  tool: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bottom: { gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(0,0,0,0.35)" },
  gifs: { borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", padding: 10 },
  asks: { gap: 10, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.6)", padding: 12 },
  asksHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  asksCount: { color: "#fff", fontSize: 13, fontWeight: "700", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 2 },
  askSlide: { borderRadius: 25, borderWidth: 3, borderColor: "transparent" },
  askTick: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.35)" },
  askDone: { alignItems: "center", borderRadius: 999, backgroundColor: brand, paddingVertical: 11 },
  swatches: { flexGrow: 1, justifyContent: "center" },
  swatchRow: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  custom: { gap: 12, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", padding: 14 },
  customRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#fff" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 999, paddingVertical: 6, paddingLeft: 6, paddingRight: 14 },
  check: { width: 20, height: 20, borderRadius: 10 },
  toggleOn: { backgroundColor: "#fff" },
  toggleOff: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  bar: { height: 28, borderRadius: 14, justifyContent: "center" },
  knob: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.15)" },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  swatchOn: { borderColor: "#fff", transform: [{ scale: 1.15 }] },
  field: { borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 16, paddingHorizontal: 16, paddingVertical: 10 },
  dim: { color: "rgba(255,255,255,0.65)", fontSize: 13 },
  warn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, backgroundColor: "rgba(239,68,68,0.35)", padding: 12 },
  cut: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 7 },
  error: { color: "#fff", fontSize: 14, borderRadius: 16, backgroundColor: "rgba(239,68,68,0.35)", paddingHorizontal: 12, paddingVertical: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 14, paddingVertical: 10 },
  share: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: brand, paddingHorizontal: 20, paddingVertical: 11 },
});
