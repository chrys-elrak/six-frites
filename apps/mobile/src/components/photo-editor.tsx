import {
  BLUR_SIZES,
  type CropHandle,
  type CropRect,
  EDIT_COLORS,
  EMOJI_SIZES,
  FULL_CROP,
  LABEL_FONTS,
  LABEL_LINE,
  type LabelFont,
  type Label,
  NO_EDIT,
  PEN_SIZES,
  type PhotoEdit,
  type Stroke,
  TEXT_SIZES,
  cropPixels,
  dragCrop,
  flipEdit,
  isEdited,
  labelAt,
  labelBox,
  orientedSize,
  scaleLabel,
  turnEdit,
} from "@six/shared";
import { useFonts } from "expo-font";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Check, Crop, Droplet, FlipHorizontal2, Pencil, RotateCcw, Smile, Trash2, Type, Undo2, X } from "lucide-react-native";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type GestureResponderHandlers,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, G, Mask, Path, Image as SvgImage, Text as SvgText } from "react-native-svg";
import { useT } from "@/lib/i18n";
import { editPhoto, editedFromPng } from "@/lib/media";
import type { LocalFile } from "@/lib/send";
import { brand, brandInk } from "@/lib/theme";
import { EmojiPicker } from "./emoji-picker";

type Tool = "crop" | "draw" | "blur";
interface Source {
  uri: string;
  tiny: string;
  width: number;
  height: number;
}
interface Writing {
  index: number;
  text: string;
  color: string;
  size: number;
  font: LabelFont;
  emoji?: boolean;
}

const FONT_NAMES = Object.keys(LABEL_FONTS) as LabelFont[];
const familyOf = (font: LabelFont | undefined) => (font && LABEL_FONTS[font]) || undefined;
const FONT_FILES = {
  DMSerifDisplay: require("../../assets/fonts/DMSerifDisplay-Regular.ttf"),
  PermanentMarker: require("../../assets/fonts/PermanentMarker-Regular.ttf"),
  Pacifico: require("../../assets/fonts/Pacifico-Regular.ttf"),
  SpecialElite: require("../../assets/fonts/SpecialElite-Regular.ttf"),
};

const WORK_EDGE = 3072;
const EXPORT_EDGE = 2560;
const BLUR_DETAIL = 24;
const CORNERS = ["nw", "ne", "sw", "se"] as const;
const pct = (v: number) => `${v * 100}%` as const;

function pathOf(s: Stroke, width: number, height: number) {
  let d = `M${s.points[0]! * width} ${s.points[1]! * height}`;
  for (let i = 0; i < s.points.length; i += 2) d += `L${s.points[i]! * width} ${s.points[i + 1]! * height}`;
  return d;
}

function LabelText({ label: l, width, height }: { label: Label; width: number; height: number }) {
  const font = l.size * Math.max(width, height);
  const lines = l.text.split("\n");
  return lines.map((s, i) => {
    const at = {
      x: l.x * width,
      y: l.y * height + (i - (lines.length - 1) / 2) * font * LABEL_LINE + font * 0.35,
      fontSize: font,
      fontFamily: familyOf(l.font),
      fontWeight: familyOf(l.font) ? ("normal" as const) : ("bold" as const),
      textAnchor: "middle" as const,
      fill: l.color,
    };
    return (
      <G key={i}>
        {!l.emoji && (
          <SvgText {...at} stroke={l.color === EDIT_COLORS[1] ? "#fff" : "rgba(0,0,0,0.7)"} strokeWidth={font / 7} strokeLinejoin="round">
            {s}
          </SvgText>
        )}
        <SvgText {...at}>{s}</SvgText>
      </G>
    );
  });
}

/**
 * The photo as `edit` says, drawn as an SVG showing `view` of it. Blur strokes uncover a copy of the photo shrunk
 * to a few pixels and stretched back, so nothing under them can be read.
 */
function Scene({ src, edit, view, width, height, svg }: { src: Source; edit: PhotoEdit; view: CropRect; width: number; height: number; svg?: Ref<Svg> }) {
  const { width: w, height: h } = orientedSize(src.width, src.height, edit.turns);
  const px = cropPixels(view, w, h);
  const edge = Math.max(w, h);
  const orient = `translate(${w / 2} ${h / 2}) scale(${edit.flipped ? -1 : 1} 1) rotate(${-90 * edit.turns}) translate(${-src.width / 2} ${-src.height / 2})`;
  const blurs = edit.strokes.filter((s) => s.blur);
  const line = (s: Stroke, i: number) => (
    <Path
      key={i}
      d={pathOf(s, w, h)}
      stroke={s.blur ? "#fff" : s.color}
      strokeWidth={s.size * edge}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
  return (
    <Svg ref={svg} width={width} height={height} viewBox={`${px.originX} ${px.originY} ${px.width} ${px.height}`}>
      <G transform={orient}>
        <SvgImage href={src.uri} width={src.width} height={src.height} preserveAspectRatio="none" />
      </G>
      {blurs.length > 0 && (
        <>
          <Defs>
            <Mask id="blur" maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
              {blurs.map(line)}
            </Mask>
          </Defs>
          <G mask="url(#blur)">
            <G transform={orient}>
              <SvgImage href={src.tiny} width={src.width} height={src.height} preserveAspectRatio="none" />
            </G>
          </G>
        </>
      )}
      {edit.strokes.map((s, i) => !s.blur && line(s, i))}
      {edit.labels.map((l, i) => (
        <LabelText key={i} label={l} width={w} height={h} />
      ))}
    </Svg>
  );
}

function Sizes({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const tr = useT();
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          accessibilityLabel={tr.composer.size(i + 1)}
          accessibilityState={{ selected: value === i }}
          style={[styles.sizeButton, value === i && { backgroundColor: "rgba(255,255,255,0.25)" }]}
        >
          <View style={{ width: 6 + i * 6, height: 6 + i * 6, borderRadius: 9, backgroundColor: "#fff" }} />
        </Pressable>
      ))}
    </View>
  );
}

function Fonts({ value, onChange }: { value: LabelFont; onChange: (f: LabelFont) => void }) {
  const tr = useT();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
      {FONT_NAMES.map((f) => (
        <Pressable
          key={f}
          onPress={() => onChange(f)}
          accessibilityState={{ selected: value === f }}
          style={[styles.font, { backgroundColor: value === f ? "#fff" : "rgba(255,255,255,0.15)" }]}
        >
          <Text style={{ color: value === f ? "#000" : "#fff", fontSize: 15, fontFamily: familyOf(f), fontWeight: familyOf(f) ? "400" : "700" }}>
            {tr.composer.fonts[f]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const tr = useT();
  return (
    <View style={styles.row}>
      {EDIT_COLORS.map((c, i) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          accessibilityLabel={tr.composer.color(i + 1)}
          accessibilityState={{ selected: value === c }}
          hitSlop={4}
          style={[styles.swatch, { backgroundColor: c }, value === c && styles.swatchOn]}
        />
      ))}
    </View>
  );
}

export function PhotoEditor({
  file,
  onCancel,
  onDone,
}: {
  file: LocalFile;
  onCancel: () => void;
  onDone: (file: LocalFile) => void;
}) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [src, setSrc] = useState<Source | null>(null);
  const [edit, setEdit] = useState(NO_EDIT);
  const [history, setHistory] = useState<PhotoEdit[]>([]);
  const [tool, setTool] = useState<Tool | null>(null);
  const [color, setColor] = useState(EDIT_COLORS[2]!);
  const [size, setSize] = useState(1);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [exporting, setExporting] = useState(false);
  const svg = useRef<Svg>(null);
  const [fontsLoaded, fontsFailed] = useFonts(FONT_FILES);
  const ready = src && (fontsLoaded || !!fontsFailed);

  useEffect(() => {
    let gone = false;
    (async () => {
      const base = await ImageManipulator.manipulate(file.uri).renderAsync();
      const scale = Math.min(1, WORK_EDGE / Math.max(base.width, base.height));
      const work = scale < 1 ? await ImageManipulator.manipulate(base).resize({ width: Math.round(base.width * scale) }).renderAsync() : base;
      const format = file.mime === "image/png" ? SaveFormat.PNG : SaveFormat.JPEG;
      const { uri } = await work.saveAsync({ format, compress: 0.95 });
      const tinyRef = await ImageManipulator.manipulate(base).resize({ width: BLUR_DETAIL }).renderAsync();
      const tiny = (await tinyRef.saveAsync({ format: SaveFormat.PNG })).uri;
      if (!gone) setSrc({ uri, tiny, width: base.width, height: base.height });
    })().catch(onCancel);
    return () => {
      gone = true;
    };
  }, [file.uri]);

  const view = tool === "crop" ? FULL_CROP : edit.crop;
  const oriented = src ? orientedSize(src.width, src.height, edit.turns) : { width: 1, height: 1 };
  const fit = Math.min(stage.width / (oriented.width * view.w), stage.height / (oriented.height * view.h));
  const frame = { width: oriented.width * view.w * fit, height: oriented.height * view.h * fit };
  const shown = writing ? { ...edit, labels: edit.labels.filter((_, i) => i !== writing.index) } : edit;
  const chosen = !tool && !writing && selected !== null ? edit.labels[selected] : undefined;
  const half = chosen ? labelBox(chosen, oriented.width, oriented.height) : { halfW: 0, halfH: 0 };
  const onScreen = frame.width / (oriented.width * view.w || 1);

  const change = (next: (e: PhotoEdit) => PhotoEdit) => {
    setHistory((h) => [...h, edit]);
    setEdit(next);
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory(history.slice(0, -1));
    setEdit(last);
    setSelected(null);
  };

  const handle = { x: half.halfW * onScreen, y: half.halfH * onScreen };
  const latest = useRef({ edit, tool, view, frame, oriented, color, size, selected, handle });
  latest.current = { edit, tool, view, frame, oriented, color, size, selected, handle };

  const grips = useMemo(
    () =>
      Object.fromEntries(
        (["move", ...CORNERS] as const).map((handle) => {
          let from = FULL_CROP;
          const pan = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
              from = latest.current.edit.crop;
              setHistory((h) => [...h, latest.current.edit]);
            },
            onPanResponderMove: (_, g) => {
              const f = latest.current.frame;
              setEdit((ed) => ({ ...ed, crop: dragCrop(from, handle, g.dx / f.width, g.dy / f.height) }));
            },
          });
          return [handle, pan.panHandlers];
        }),
      ) as Record<CropHandle, GestureResponderHandlers>,
    [],
  );

  const sizer = useMemo(() => {
    let index = -1;
    let from: Label | undefined;
    let corner = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { edit: ed, selected: s, handle: h } = latest.current;
        index = s ?? -1;
        from = ed.labels[index];
        corner = h;
        setHistory((list) => [...list, ed]);
      },
      onPanResponderMove: (_, g) => {
        if (!from) return;
        const l = scaleLabel(from, Math.hypot(corner.x + g.dx, corner.y + g.dy) / Math.max(1, Math.hypot(corner.x, corner.y)));
        setEdit((now) => ({ ...now, labels: now.labels.map((it, i) => (i === index ? l : it)) }));
      },
    });
  }, []);

  const touch = useMemo(() => {
    let start = { x: 0, y: 0 };
    let index = -1;
    let from: Label | undefined;
    let moved = false;
    let onLabel = false;
    let pinch: { from: Label; distance: number } | null = null;
    const at = (x: number, y: number) => {
      const { view: v, frame: f } = latest.current;
      return [v.x + (x / f.width) * v.w, v.y + (y / f.height) * v.h] as const;
    };
    const drawing = () => latest.current.tool === "draw" || latest.current.tool === "blur";
    return PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        if (drawing()) return true;
        const { edit: ed, oriented: o, selected: s } = latest.current;
        return s !== null || labelAt(ed.labels, ...at(e.nativeEvent.locationX, e.nativeEvent.locationY), o.width, o.height) >= 0;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { edit: ed, tool: t, oriented: o, color: c, size: s } = latest.current;
        start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        moved = false;
        pinch = null;
        if (drawing()) {
          index = -1;
          from = undefined;
          const stroke = { blur: t === "blur" || undefined, color: c, size: (t === "blur" ? BLUR_SIZES : PEN_SIZES)[s]!, points: [...at(start.x, start.y)] };
          setHistory((h) => [...h, ed]);
          setEdit((now) => ({ ...now, strokes: [...now.strokes, stroke] }));
          return;
        }
        const hit = labelAt(ed.labels, ...at(start.x, start.y), o.width, o.height);
        onLabel = hit >= 0;
        index = onLabel ? hit : (latest.current.selected ?? -1);
        from = ed.labels[index];
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (from && touches.length >= 2) {
          const distance = Math.hypot(touches[0]!.pageX - touches[1]!.pageX, touches[0]!.pageY - touches[1]!.pageY);
          const ed = latest.current.edit;
          if (!pinch) {
            pinch = { from: ed.labels[index]!, distance: Math.max(1, distance) };
            if (!moved) setHistory((h) => [...h, ed]);
            moved = true;
          }
          const l = scaleLabel(pinch.from, distance / pinch.distance);
          setEdit((now) => ({ ...now, labels: now.labels.map((it, i) => (i === index ? l : it)) }));
          return;
        }
        if (pinch || (index >= 0 && !onLabel)) return;
        if (index < 0) {
          const [x, y] = at(start.x + g.dx, start.y + g.dy);
          setEdit((now) => {
            const strokes = now.strokes.slice();
            const last = strokes.at(-1)!;
            strokes[strokes.length - 1] = { ...last, points: [...last.points, x, y] };
            return { ...now, strokes };
          });
          return;
        }
        if (!from || (!moved && Math.hypot(g.dx, g.dy) < 6)) return;
        const { view: v, frame: f, edit: ed } = latest.current;
        if (!moved) setHistory((h) => [...h, ed]);
        moved = true;
        const l = { ...from, x: from.x + (g.dx / f.width) * v.w, y: from.y + (g.dy / f.height) * v.h };
        setEdit((now) => ({ ...now, labels: now.labels.map((it, i) => (i === index ? l : it)) }));
      },
      onPanResponderRelease: () => {
        if (index < 0 || !from) return;
        if (!onLabel && !pinch) return setSelected(null);
        if (moved || latest.current.selected !== index) return setSelected(index);
        const sizes = from.emoji ? EMOJI_SIZES : TEXT_SIZES;
        setWriting({ index, text: from.text, color: from.color, size: sizes.indexOf(from.size), font: from.font ?? "classic", emoji: from.emoji });
      },
    });
  }, []);

  function finishWriting() {
    const w = writing!;
    setWriting(null);
    const words = w.emoji ? w.text : w.text.trim();
    if (!words && w.index < 0) return;
    setSelected(!words ? null : w.index < 0 ? edit.labels.length : w.index);
    const label: Label = {
      ...(w.emoji && { emoji: true }),
      ...(w.font !== "classic" && { font: w.font }),
      text: words,
      color: w.color,
      size: (w.emoji ? EMOJI_SIZES : TEXT_SIZES)[w.size] ?? edit.labels[w.index]!.size,
      x: edit.labels[w.index]?.x ?? view.x + view.w / 2,
      y: edit.labels[w.index]?.y ?? view.y + view.h / 2,
    };
    change((ed) => ({
      ...ed,
      labels: !words
        ? ed.labels.filter((_, i) => i !== w.index)
        : w.index < 0
          ? [...ed.labels, label]
          : ed.labels.map((l, i) => (i === w.index ? label : l)),
    }));
  }

  function addEmoji(emoji: string) {
    setPicking(false);
    const label = { emoji: true, text: emoji, color: "#fff", size: EMOJI_SIZES[1]!, x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setSelected(edit.labels.length);
    change((ed) => ({ ...ed, labels: [...ed.labels, label] }));
  }

  async function done() {
    if (!src) return;
    if (!isEdited(edit)) return onCancel();
    if (edit.strokes.length || edit.labels.length) {
      setTool(null);
      setExporting(true);
      return;
    }
    setExporting(true);
    editPhoto(file, edit, src.width, src.height).then(onDone, onCancel);
  }

  useEffect(() => {
    if (!exporting || tool === "crop" || !svg.current || !(edit.strokes.length || edit.labels.length)) return;
    const px = cropPixels(edit.crop, oriented.width, oriented.height);
    const k = Math.min(1, EXPORT_EDGE / Math.max(px.width, px.height));
    svg.current.toDataURL((base64) => void editedFromPng(file, base64).then(onDone, onCancel), {
      width: Math.round(px.width * k),
      height: Math.round(px.height * k),
    });
  }, [exporting, tool]);

  const pick = (t: Tool) => {
    setSelected(null);
    setTool((now) => (now === t ? null : t));
  };
  const tools = [
    { id: "crop" as const, Icon: Crop, label: tr.composer.editTools.crop, onPress: () => pick("crop") },
    { id: "draw" as const, Icon: Pencil, label: tr.composer.editTools.draw, onPress: () => pick("draw") },
    { id: "blur" as const, Icon: Droplet, label: tr.composer.editTools.blur, onPress: () => pick("blur") },
    {
      id: null,
      Icon: Type,
      label: tr.composer.editTools.text,
      onPress: () => {
        setTool(null);
        setSelected(null);
        setWriting({ index: -1, text: "", color: EDIT_COLORS[0]!, size: 1, font: "classic" });
      },
    },
    {
      id: null,
      Icon: Smile,
      label: tr.composer.editTools.emoji,
      onPress: () => {
        setTool(null);
        setPicking(true);
      },
    },
  ];
  const shade = [
    { left: 0, right: 0, top: 0, height: pct(edit.crop.y) },
    { left: 0, right: 0, top: pct(edit.crop.y + edit.crop.h), bottom: 0 },
    { left: 0, width: pct(edit.crop.x), top: pct(edit.crop.y), height: pct(edit.crop.h) },
    { left: pct(edit.crop.x + edit.crop.w), right: 0, top: pct(edit.crop.y), height: pct(edit.crop.h) },
  ];

  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (writing ? setWriting(null) : onCancel())}
    >
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.bar}>
          <Pressable onPress={onCancel} accessibilityLabel={tr.common.cancel} hitSlop={8} style={styles.tool}>
            <X size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={undo}
            disabled={!history.length}
            accessibilityLabel={tr.composer.undo}
            hitSlop={8}
            style={[styles.tool, !history.length && { opacity: 0.3 }]}
          >
            <Undo2 size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
          {!ready && <ActivityIndicator size="large" color="#fff" />}
          {ready && fit > 0 && (
            <View style={frame}>
              <Scene src={src} edit={shown} view={view} width={frame.width} height={frame.height} svg={svg} />
              {tool === "crop" ? (
                <>
                  {shade.map((s, i) => (
                    <View key={i} pointerEvents="none" style={[styles.shade, s]} />
                  ))}
                  <View
                    {...grips.move}
                    style={[styles.box, { left: pct(edit.crop.x), top: pct(edit.crop.y), width: pct(edit.crop.w), height: pct(edit.crop.h) }]}
                  >
                    {CORNERS.map((corner) => (
                      <View
                        key={corner}
                        {...grips[corner]}
                        style={[
                          styles.grip,
                          corner[0] === "n" ? { top: 0, justifyContent: "flex-start" } : { bottom: 0, justifyContent: "flex-end" },
                          corner[1] === "w" ? { left: 0, alignItems: "flex-start" } : { right: 0, alignItems: "flex-end" },
                        ]}
                      >
                        <View style={styles.dot} />
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View {...touch.panHandlers} style={StyleSheet.absoluteFill} />
              )}
              {chosen && (
                <>
                  <View
                    pointerEvents="none"
                    style={[
                      styles.selection,
                      {
                        left: (chosen.x - view.x) / view.w * frame.width - handle.x,
                        top: (chosen.y - view.y) / view.h * frame.height - handle.y,
                        width: handle.x * 2,
                        height: handle.y * 2,
                      },
                    ]}
                  />
                  <View
                    {...sizer.panHandlers}
                    style={[
                      styles.sizer,
                      {
                        left: (chosen.x - view.x) / view.w * frame.width + handle.x - 22,
                        top: (chosen.y - view.y) / view.h * frame.height + handle.y - 22,
                      },
                    ]}
                  >
                    <View style={styles.sizerDot} />
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View style={styles.options}>
          {tool === "crop" && (
            <>
              <Pressable onPress={() => change(turnEdit)} accessibilityLabel={tr.composer.rotate} hitSlop={8} style={styles.tool}>
                <RotateCcw size={26} color="#fff" />
              </Pressable>
              <Pressable onPress={() => change(flipEdit)} accessibilityLabel={tr.composer.flip} hitSlop={8} style={styles.tool}>
                <FlipHorizontal2 size={26} color="#fff" />
              </Pressable>
            </>
          )}
          {tool === "draw" && <Colors value={color} onChange={setColor} />}
          {(tool === "draw" || tool === "blur") && <Sizes value={size} onChange={setSize} />}
        </View>

        <View style={styles.tools}>
          <View style={styles.toolRow}>
            {tools.map(({ id, Icon, label, onPress }) => {
              const on = !!id && tool === id;
              return (
                <Pressable
                  key={label}
                  onPress={onPress}
                  accessibilityLabel={label}
                  accessibilityState={id ? { selected: on } : undefined}
                  style={[styles.tool, on && { backgroundColor: "#fff" }]}
                >
                  <Icon size={24} color={on ? "#000" : "#fff"} />
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={done}
            disabled={!src || exporting}
            accessibilityLabel={tr.common.done}
            style={[styles.tool, styles.done, (!src || exporting) && { opacity: 0.5 }]}
          >
            {exporting ? <ActivityIndicator color={brandInk} /> : <Check size={26} color={brandInk} />}
          </Pressable>
        </View>

        {writing && (
          <KeyboardAvoidingView
            behavior="padding"
            style={[StyleSheet.absoluteFill, styles.writing, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}
          >
            <View style={styles.bar}>
              {writing.index >= 0 ? (
                <Pressable
                  onPress={() => {
                    setWriting(null);
                    setSelected(null);
                    change((ed) => ({ ...ed, labels: ed.labels.filter((_, i) => i !== writing.index) }));
                  }}
                  accessibilityLabel={tr.common.remove}
                  hitSlop={8}
                  style={styles.tool}
                >
                  <Trash2 size={24} color="#fff" />
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={finishWriting} style={styles.doneText}>
                <Text style={{ color: brandInk, fontWeight: "700", fontSize: 15 }}>{tr.common.done}</Text>
              </Pressable>
            </View>
            <View style={styles.writeArea}>
              <TextInput
                autoFocus
                multiline
                value={writing.text}
                onChangeText={(text) => setWriting({ ...writing, text })}
                placeholder={tr.composer.typeSomething}
                placeholderTextColor="rgba(255,255,255,0.4)"
                accessibilityLabel={tr.composer.editTools.text}
                style={{
                  color: writing.emoji ? "#fff" : writing.color,
                  fontSize: writing.emoji ? 64 : ([24, 32, 44][writing.size] ?? 32),
                  fontFamily: familyOf(writing.font),
                  fontWeight: familyOf(writing.font) ? "400" : "700",
                  textAlign: "center",
                }}
              />
            </View>
            <View style={styles.writeOptions}>
              {!writing.emoji && <Fonts value={writing.font} onChange={(f) => setWriting({ ...writing, font: f })} />}
              {!writing.emoji && <Colors value={writing.color} onChange={(c) => setWriting({ ...writing, color: c })} />}
              <Sizes value={writing.size} onChange={(i) => setWriting({ ...writing, size: i })} />
            </View>
          </KeyboardAvoidingView>
        )}

        <EmojiPicker open={picking} onClose={() => setPicking(false)} onPick={addEmoji} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 8 },
  stage: { flex: 1, margin: 24, alignItems: "center", justifyContent: "center" },
  shade: { position: "absolute", backgroundColor: "rgba(0,0,0,0.6)" },
  box: { position: "absolute", borderWidth: 2, borderColor: "#fff" },
  grip: { position: "absolute", width: 44, height: 44 },
  dot: { width: 16, height: 16, borderRadius: 8, margin: -9, backgroundColor: "#fff" },
  selection: { position: "absolute", borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.9)", borderRadius: 6 },
  sizer: { position: "absolute", width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sizerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "rgba(0,0,0,0.4)", backgroundColor: "#fff" },
  options: { minHeight: 56, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  font: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  sizeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: "#fff" },
  swatchOn: { borderWidth: 3, transform: [{ scale: 1.15 }] },
  tools: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 4 },
  toolRow: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 4 },
  tool: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: brand },
  writing: { backgroundColor: "rgba(0,0,0,0.8)" },
  doneText: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  writeArea: { flex: 1, justifyContent: "center", padding: 24 },
  writeOptions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12, padding: 12 },
});
