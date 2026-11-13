import {
  EDIT_COLORS,
  type LabelFont,
  STORY_LIMITS,
  STORY_PEN_SIZES,
  STORY_SHAPES,
  STORY_STICKER_SCALE,
  angleOf,
  turned,
  STORY_TEXT_LOOKS,
  STORY_TEXT_SIZE,
  type StoryDrawing,
  type StoryShape,
  type StoryTextLook,
  extendStroke,
  inkOn,
  startStroke,
  storyStrokePath,
  strokeTooSmall,
} from "@six/shared";
import { useFonts } from "expo-font";
import { Check, Circle, MoveDiagonal2, MoveUpRight, Pencil, Square, Trash2, Undo2 } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, type TextStyle, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { fingers } from "@/lib/fingers";
import { useT } from "@/lib/i18n";
import { brand, brandInk } from "@/lib/theme";
import { Colors, FONT_FILES, Fonts, Sizes, familyOf } from "./photo-editor";
import { Text, TextInput } from "./text";

export interface Pen {
  shape: StoryShape;
  color: string;
  size: number;
}

export interface Writing {
  index: number;
  text: string;
  color: string;
  font: LabelFont;
  look: StoryTextLook;
}

const SHAPE_ICONS = { pen: Pencil, arrow: MoveUpRight, circle: Circle, rect: Square };
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const shadow = (color: string) => (color === EDIT_COLORS[1] ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)");
const RING = [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => [x, y] as const)).filter(([x, y]) => x || y);

/** Text in one of the story looks: plain with a soft shadow, on a pill of its colour, or ringed in black or white. */
function LookText({ text, look, color, size, font }: { text: string; look?: StoryTextLook; color: string; size: number; font: LabelFont }) {
  const base = { fontSize: size, fontFamily: familyOf(font), fontWeight: familyOf(font) ? "400" : "700", textAlign: "center" } as const;
  if (look === "box") {
    return (
      <View style={{ backgroundColor: color, borderRadius: size * 0.3, paddingHorizontal: size * 0.4, paddingVertical: size * 0.1 }}>
        <Text style={[base, { color: inkOn(color) }]}>{text}</Text>
      </View>
    );
  }
  if (look === "outline") {
    const r = Math.max(1, size * 0.05);
    return (
      <View>
        {RING.map(([x, y]) => (
          <Text
            key={`${x}${y}`}
            style={[base, { position: "absolute", left: 0, right: 0, top: 0, color: inkOn(color), transform: [{ translateX: x * r }, { translateY: y * r }] }]}
          >
            {text}
          </Text>
        ))}
        <Text style={[base, { color }]}>{text}</Text>
      </View>
    );
  }
  return (
    <Text style={[base, { color, textShadowColor: shadow(color), textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }]}>{text}</Text>
  );
}

type Grab =
  | { kind: "stroke"; x: number; y: number; px: number; py: number }
  | {
      kind: "move";
      index: number;
      count: number;
      px: number;
      py: number;
      apart: number;
      angle: number;
      from: { x: number; y: number; scale: number; rotate: number };
      moved: boolean;
    }
  | { kind: "resize"; index: number; px: number; py: number; from: number; rot0: number; centre: { x: number; y: number } | null };

/**
 * What the poster drew on a story, filling its parent. In the composer, `pen` turns it into a canvas to draw on;
 * without it, `onChange` lets each text be dragged, resized and turned by its corner or two fingers, and `onEditText` is called when one is
 * tapped. `onBegin` comes before each change, to keep it for undo.
 */
export function StoryDrawingLayer({
  drawing,
  pen,
  onBegin,
  onChange,
  onEditText,
  raise,
  children,
}: {
  drawing: StoryDrawing;
  pen?: Pen | null;
  onBegin?: () => void;
  onChange?: (d: StoryDrawing) => void;
  onEditText?: (index: number) => void;
  /** The stacking order that puts a text now at `z` on top of everything else on the story. */
  raise?: (z: number | undefined) => number;
  /** The placed stickers, under the drawing until moved, so they share one stacking order with its texts. */
  children?: React.ReactNode;
}) {
  useFonts(FONT_FILES);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  const latest = useRef(drawing);
  latest.current = drawing;
  const grab = useRef<Grab | null>(null);
  const boxes = useRef<(ComponentRef<typeof View> | null)[]>([]);
  const set = (d: StoryDrawing) => {
    latest.current = d;
    onChange?.(d);
  };

  function move(e: GestureResponderEvent) {
    const g = grab.current;
    const d = latest.current;
    if (!g) return;
    if (g.kind === "move") return moveText(g, e);
    const [dx, dy] = [e.nativeEvent.pageX - g.px, e.nativeEvent.pageY - g.py];
    if (g.kind === "stroke") {
      const strokes = d.strokes.slice();
      strokes[strokes.length - 1] = extendStroke(strokes.at(-1)!, g.x + dx / w, g.y + dy / h);
      return set({ ...d, strokes });
    }
    const c = g.centre;
    if (!c) return;
    const now = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    const texts = d.texts.slice();
    const t = texts[g.index]!;
    const scale = (g.from * Math.hypot(now.x - c.x, now.y - c.y)) / Math.max(1, Math.hypot(g.px - c.x, g.py - c.y));
    const rotate = turned(g.rot0 + angleOf(c, now) - angleOf(c, { x: g.px, y: g.py }));
    texts[g.index] = { ...t, scale: Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, scale)), rotate };
    set({ ...d, texts });
  }

  /**
   * Drags a text with one finger, and pinches it bigger or smaller and twists it with two, carrying on from where it is
   * whenever a finger lands or lifts. The text moved comes on top of everything else.
   */
  function moveText(g: Extract<Grab, { kind: "move" }>, e: GestureResponderEvent) {
    const d = latest.current;
    const t = d.texts[g.index]!;
    const f = fingers(e.nativeEvent.touches);
    if (f.count !== g.count) {
      Object.assign(g, { count: f.count, px: f.x, py: f.y, apart: f.apart, angle: f.angle, from: { x: t.x, y: t.y, scale: t.scale, rotate: t.rotate ?? 0 } });
      return;
    }
    const [dx, dy] = [f.x - g.px, f.y - g.py];
    if (!g.moved && f.count < 2 && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) onBegin?.();
    const z = g.moved ? t.z : (raise?.(t.z) ?? t.z);
    g.moved = true;
    const scale = f.count === 2 && g.apart ? (g.from.scale * f.apart) / g.apart : g.from.scale;
    const texts = d.texts.slice();
    texts[g.index] = {
      ...t,
      x: clamp(g.from.x + dx / w),
      y: clamp(g.from.y + dy / h),
      scale: Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, scale)),
      rotate: f.count === 2 ? turned(g.from.rotate + f.angle - g.angle) : g.from.rotate,
      z,
    };
    set({ ...d, texts });
  }

  function up() {
    const g = grab.current;
    grab.current = null;
    const last = latest.current.strokes.at(-1);
    if (g?.kind === "stroke" && last && strokeTooSmall(last)) set({ ...latest.current, strokes: latest.current.strokes.slice(0, -1) });
    if (g?.kind === "move" && !g.moved) onEditText?.(g.index);
  }

  const follow = { onResponderTerminationRequest: () => false, onResponderMove: move, onResponderRelease: up, onResponderTerminate: up };
  const editing = !!onChange && !pen;
  const canvas = pen &&
    onChange && {
      ...follow,
      onStartShouldSetResponder: () => latest.current.strokes.length < 80,
      onResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY, pageX, pageY } = e.nativeEvent;
        const [x, y] = [locationX / w, locationY / h];
        grab.current = { kind: "stroke", x, y, px: pageX, py: pageY };
        onBegin?.();
        set({ ...latest.current, strokes: [...latest.current.strokes, startStroke(pen.shape, pen.color, pen.size, x, y)] });
      },
    };

  return (
    <View
      pointerEvents={pen ? "auto" : editing || children ? "box-none" : "none"}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      {...canvas}
    >
      {children}
      {w > 0 && (
        <Svg width={w} height={h} pointerEvents="none" style={StyleSheet.absoluteFill}>
          {drawing.strokes.map((s, i) => (
            <Path
              key={i}
              d={storyStrokePath(s, w, h)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.size * w}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      )}
      {w > 0 &&
        drawing.texts.map((t, i) => (
          <View
            key={i}
            pointerEvents="box-none"
            style={[styles.anchor, { zIndex: t.z, left: t.x * w - w * 0.45, top: t.y * h - h, width: w * 0.9, height: h * 2 }]}
          >
            <View
              ref={(v) => {
                boxes.current[i] = v;
              }}
              pointerEvents={editing ? "auto" : "none"}
              style={{ transform: [{ rotate: `${t.rotate ?? 0}deg` }] }}
              {...follow}
              onStartShouldSetResponder={() => editing}
              onResponderGrant={(e) => {
                const f = fingers(e.nativeEvent.touches);
                grab.current = {
                  kind: "move",
                  index: i,
                  count: f.count,
                  px: f.x,
                  py: f.y,
                  apart: f.apart,
                  angle: f.angle,
                  from: { x: t.x, y: t.y, scale: t.scale, rotate: t.rotate ?? 0 },
                  moved: false,
                };
              }}
            >
              <LookText text={t.text} look={t.look} color={t.color} size={STORY_TEXT_SIZE * t.scale * w} font={t.font} />
              {editing && (
                <View
                  {...follow}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={(e) => {
                    const { pageX, pageY } = e.nativeEvent;
                    onBegin?.();
                    if (raise) set({ ...latest.current, texts: latest.current.texts.map((it, j) => (j === i ? { ...it, z: raise(t.z) } : it)) });
                    const g: Grab = { kind: "resize", index: i, px: pageX, py: pageY, from: t.scale, rot0: t.rotate ?? 0, centre: null };
                    grab.current = g;
                    boxes.current[i]?.measureInWindow((x, y, bw, bh) => (g.centre = { x: x + bw / 2, y: y + bh / 2 }));
                  }}
                  hitSlop={10}
                  style={styles.handle}
                >
                  <MoveDiagonal2 size={14} color="#1c1917" strokeWidth={2.5} />
                </View>
              )}
            </View>
          </View>
        ))}
    </View>
  );
}

/** The pen, arrow and shape tools, colours and sizes shown while drawing on a story. */
export function DrawBar({
  pen,
  onPen,
  canUndo,
  onUndo,
  onDone,
}: {
  pen: Pen;
  onPen: (p: Pen) => void;
  canUndo: boolean;
  onUndo: () => void;
  onDone: () => void;
}) {
  const tr = useT();
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <View style={styles.shapes}>
        {STORY_SHAPES.map((shape) => {
          const Icon = SHAPE_ICONS[shape];
          const on = pen.shape === shape;
          return (
            <Pressable
              key={shape}
              onPress={() => onPen({ ...pen, shape })}
              accessibilityRole="button"
              accessibilityLabel={tr.stories.shapes[shape]}
              accessibilityState={{ selected: on }}
              style={[styles.round, on && { backgroundColor: "#fff" }]}
            >
              <Icon size={20} color={on ? "#1c1917" : "#fff"} />
            </Pressable>
          );
        })}
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          accessibilityRole="button"
          accessibilityLabel={tr.composer.undo}
          style={[styles.round, !canUndo && { opacity: 0.3 }]}
        >
          <Undo2 size={20} color="#fff" />
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={tr.common.done} style={[styles.round, { backgroundColor: brand }]}>
          <Check size={20} color={brandInk} strokeWidth={2.4} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Colors value={pen.color} onChange={(color) => onPen({ ...pen, color })} />
        <Sizes
          value={STORY_PEN_SIZES.indexOf(pen.size as (typeof STORY_PEN_SIZES)[number])}
          onChange={(i) => onPen({ ...pen, size: STORY_PEN_SIZES[i]! })}
        />
      </View>
    </View>
  );
}

/** Where the poster types text to put on a story, in a colour and a font; `onRemove` takes an existing one off. */
export function TextWriter({
  writing,
  onChange,
  onDone,
  onRemove,
}: {
  writing: Writing;
  onChange: (w: Writing) => void;
  onDone: () => void;
  onRemove?: () => void;
}) {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardState((k) => (k.isVisible ? k.height : 0));
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.writer,
        { paddingTop: insets.top + 8, paddingBottom: keyboard ? keyboard + 12 : Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.writerBar}>
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={tr.common.remove} hitSlop={8} style={styles.round}>
            <Trash2 size={24} color="#fff" />
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={onDone} accessibilityRole="button" style={styles.done}>
          <Text style={{ color: brandInk, fontWeight: "700", fontSize: 15 }}>{tr.common.done}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <TextInput
          autoFocus
          multiline
          value={writing.text}
          onChangeText={(text) => onChange({ ...writing, text })}
          maxLength={STORY_LIMITS.drawnText}
          placeholder={tr.composer.typeSomething}
          placeholderTextColor="rgba(255,255,255,0.4)"
          accessibilityLabel={tr.stories.addText}
          style={[{ minWidth: 120, maxWidth: "100%", paddingHorizontal: 12, fontSize: 30, textAlign: "center" }, writtenStyle(writing)]}
        />
      </View>
      <TextStyler value={writing} onChange={(style) => onChange({ ...writing, ...style })} />
    </View>
  );
}

export type WrittenStyle = Pick<Writing, "color" | "font" | "look">;

/** How text written on a story is drawn in its colour, font and look, for a text field showing it. */
export function writtenStyle(w: WrittenStyle): TextStyle {
  return {
    color: w.look === "box" ? inkOn(w.color) : w.color,
    backgroundColor: w.look === "box" ? w.color : undefined,
    borderRadius: 10,
    fontFamily: familyOf(w.font),
    fontWeight: familyOf(w.font) ? "400" : "700",
    textShadowColor: w.look === "outline" ? inkOn(w.color) : w.look === "box" ? undefined : shadow(w.color),
    textShadowRadius: w.look === "outline" ? 3 : 6,
  };
}

/** The look, font and colour pickers for text on a story. */
export function TextStyler({ value, onChange }: { value: WrittenStyle; onChange: (style: WrittenStyle) => void }) {
  const tr = useT();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {STORY_TEXT_LOOKS.map((look) => (
          <Pressable
            key={look}
            onPress={() => onChange({ ...value, look })}
            accessibilityRole="button"
            accessibilityLabel={tr.stories.textLooks[look]}
            accessibilityState={{ selected: value.look === look }}
            style={[styles.round, value.look === look && styles.lookOn]}
          >
            <LookText text="A" look={look} color={value.color} size={18} font="classic" />
          </Pressable>
        ))}
      </View>
      <Fonts value={value.font} onChange={(font) => onChange({ ...value, font })} />
      <Colors value={value.color} onChange={(color) => onChange({ ...value, color })} />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  handle: {
    position: "absolute",
    right: -12,
    bottom: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  shapes: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.4)", padding: 4 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  lookOn: { backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 2, borderColor: "#fff" },
  writer: { zIndex: 20, backgroundColor: "rgba(0,0,0,0.8)" },
  writerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12 },
  done: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
});
