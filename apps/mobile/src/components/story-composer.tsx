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
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { CalendarDays, Camera, CaseSensitive, ClipboardPaste, ChevronDown, Clock, Hourglass, ImagePlus, MapPin, Pencil, Scissors, SendHorizontal, Sticker, Type, Video, X } from "lucide-react-native";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, type GestureResponderEvent, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocale, useT } from "@/lib/i18n";
import { cutVideo, pickMedia, recordVideo, takePhoto } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { six } from "@/lib/six";
import { postStory } from "@/lib/story-post";
import { brand, brandInk } from "@/lib/theme";
import { currentPosition } from "./location-card";
import { Modal } from "./modal";
import { Sheet } from "./sheet";
import { ChatBubbleCard, StoryStickers, backgroundAround, storyFill } from "./stories";
import { LastsPicker } from "./notes";
import { DrawBar, type Pen, StoryDrawingLayer, TextWriter, type Writing } from "./story-drawing";
import { Text, TextInput } from "./text";
import { VideoTrimmer } from "./video-trimmer";

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
  const [file, setFile] = useState<LocalFile | null>(null);
  const [text, setText] = useState(initialText ?? "");
  const [background, setBackground] = useState<string>(initialText ? backgroundAround(bubble) : STORY_BACKGROUNDS[0]);
  const [custom, setCustom] = useState(false);
  const [from, to] = background.split(",") as [string, string | undefined];
  const [gif, setGif] = useState<GifDTO | null>(null);
  const [ask, setAsk] = useState(anon ?? null);
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
  const ready = (!!file || !!text.trim() || !!gif || !!ask || drawn) && !tooLong;
  const fromChat = !!initialText && !file;

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
      file ? { uri: file.uri, kind: file.kind, name: file.name, mime: file.mime } : undefined,
    );
    onClose();
  }

  const stickers = {
    ask: ask && { text: ask.text, prompt: ask.prompt, photoUrl: ask.photoUrl, gif: ask.gif },
    gif: gif && <Image source={{ uri: gif.previewUrl }} style={{ height: 120, width: (120 * gif.width) / gif.height, borderRadius: 10 }} />,
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

  return (
    <Modal
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (writing ? setWriting(null) : drawingOn ? setDrawingOn(false) : onClose())}
    >
      <KeyboardAvoidingView behavior="padding" style={[styles.screen, file ? { backgroundColor: "#000" } : storyFill(background)]}>
        <View ref={card} pointerEvents="none" style={StyleSheet.absoluteFill} />
        <View style={styles.preview}>
          {file?.kind === "image" && <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />}
          {file?.kind === "video" && <PreviewVideo uri={file.uri} />}
          {fromChat && (
            <ChatBubbleCard text={text} bubble={bubble ?? null} quote={quote ?? null} />
          )}
          {!file && !fromChat && (
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={STORY_LIMITS.text}
              multiline
              autoFocus
              placeholder={tr.stories.typeSomething}
              placeholderTextColor="rgba(255,255,255,0.6)"
              accessibilityLabel={tr.stories.text}
              style={styles.bigInput}
            />
          )}
          <View pointerEvents="box-none" style={styles.overlay}>
            <StoryStickers {...stickers} placed={false} />
            {!!file && !!text.trim() && <Text style={styles.caption}>{text}</Text>}
          </View>
        </View>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <StoryStickers {...stickers} placed />
        </View>
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

        <View pointerEvents="box-none" style={[styles.top, { top: insets.top + 8 }]}>
          <Tool on={false} Icon={X} label={tr.common.close} onPress={onClose} />
          <View style={styles.tools}>
            {file && <Tool on={false} Icon={Type} label={tr.stories.text} onPress={() => setFile(null)} />}
            <Tool on={!!file} Icon={ImagePlus} label={`${tr.stories.photo} / ${tr.stories.video}`} onPress={() => void pick("library")} />
            <Tool on={false} Icon={Camera} label={tr.stories.photo} onPress={() => void pick("camera")} />
            <Tool on={false} Icon={Video} label={tr.stories.video} onPress={() => void pick("video")} />
            {canPaste && <Tool on={false} Icon={ClipboardPaste} label={tr.stories.pasteImage} onPress={() => void paste()} />}
            <Tool on={!!gif || pickingGif} Icon={Sticker} label={tr.stories.gif} onPress={() => (gif ? setGif(null) : setPickingGif(!pickingGif))} />
            <Tool on={!!location} busy={locating} Icon={MapPin} label={tr.stories.location} onPress={() => void locate()} />
            <Tool on={showDate} Icon={CalendarDays} label={tr.stories.date} onPress={() => setShowDate(!showDate)} />
            <Tool on={showTime} Icon={Clock} label={tr.stories.time} onPress={() => setShowTime(!showTime)} />
            <Tool on={drawingOn} Icon={Pencil} label={tr.composer.editTools.draw} onPress={() => setDrawingOn(!drawingOn)} />
            <Tool
              on={false}
              Icon={CaseSensitive}
              label={tr.stories.addText}
              onPress={() => {
                setDrawingOn(false);
                if (drawing.texts.length < 10) setWriting({ index: -1, text: "", color: EDIT_COLORS[0]!, font: "classic", look: "plain" });
              }}
            />
          </View>
        </View>

        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
          {pickingGif && (
            <View style={styles.gifs}>
              <GifSearch
                onPick={(g) => {
                  setGif(g);
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
          {!file && !drawingOn && (
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
                    setDrawing((d) => ({ ...d, texts: d.texts.filter((_, i) => i !== writing.index) }));
                    setWriting(null);
                  }
                : undefined
            }
          />
        )}
      </KeyboardAvoidingView>
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
      {cutting && file && <VideoTrimmer file={file} onCancel={() => setCutting(false)} onDone={(from, to) => void cut(from, to)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  preview: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bigInput: { width: "100%", color: "#fff", fontSize: 26, lineHeight: 34, fontWeight: "700", textAlign: "center", paddingHorizontal: 64 },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 10, paddingHorizontal: 64, paddingBottom: 12 },
  caption: { color: "#fff", fontSize: 16, textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  top: { position: "absolute", left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tools: { gap: 10 },
  tool: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bottom: { gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(0,0,0,0.35)" },
  gifs: { borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", padding: 10 },
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
