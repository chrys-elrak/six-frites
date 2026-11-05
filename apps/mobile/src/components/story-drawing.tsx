import {
  EDIT_COLORS,
  type LabelFont,
  STORY_LIMITS,
  STORY_PEN_SIZES,
  STORY_SHAPES,
  STORY_STICKER_SCALE,
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
import { useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
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
  | { kind: "move"; index: number; px: number; py: number; from: { x: number; y: number }; moved: boolean }
  | { kind: "resize"; index: number; px: number; py: number; from: number };

/**
 * What the poster drew on a story, filling its parent. In the composer, `pen` turns it into a canvas to draw on;
 * without it, `onChange` lets each text be dragged and resized by its corner, and `onEditText` is called when one is
 * tapped. `onBegin` comes before each change, to keep it for undo.
 */
export function StoryDrawingLayer({
  drawing,
  pen,
  onBegin,
  onChange,
  onEditText,
}: {
  drawing: StoryDrawing;
  pen?: Pen | null;
  onBegin?: () => void;
  onChange?: (d: StoryDrawing) => void;
  onEditText?: (index: number) => void;
}) {
  useFonts(FONT_FILES);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  const latest = useRef(drawing);
  latest.current = drawing;
  const grab = useRef<Grab | null>(null);
  const set = (d: StoryDrawing) => {
    latest.current = d;
    onChange?.(d);
  };

  function move(e: GestureResponderEvent) {
    const g = grab.current;
    const d = latest.current;
    if (!g) return;
    const [dx, dy] = [e.nativeEvent.pageX - g.px, e.nativeEvent.pageY - g.py];
    if (g.kind === "stroke") {
      const strokes = d.strokes.slice();
      strokes[strokes.length - 1] = extendStroke(strokes.at(-1)!, g.x + dx / w, g.y + dy / h);
      return set({ ...d, strokes });
    }
    const texts = d.texts.slice();
    const t = texts[g.index]!;
    if (g.kind === "resize") {
      const scale = g.from * (1 + (dx + dy) / (w * 0.4));
      texts[g.index] = { ...t, scale: Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, scale)) };
      return set({ ...d, texts });
    }
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) onBegin?.();
    g.moved = true;
    texts[g.index] = { ...t, x: clamp(g.from.x + dx / w), y: clamp(g.from.y + dy / h) };
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
      pointerEvents={pen ? "auto" : editing ? "box-none" : "none"}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
      {...canvas}
    >
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
            style={[styles.anchor, { left: t.x * w - w * 0.45, top: t.y * h - h, width: w * 0.9, height: h * 2 }]}
          >
            <View
              pointerEvents={editing ? "auto" : "none"}
              {...follow}
              onStartShouldSetResponder={() => editing}
              onResponderGrant={(e) => {
                const { pageX, pageY } = e.nativeEvent;
                grab.current = { kind: "move", index: i, px: pageX, py: pageY, from: { x: t.x, y: t.y }, moved: false };
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
                    grab.current = { kind: "resize", index: i, px: pageX, py: pageY, from: t.scale };
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
  return (
    <View style={[StyleSheet.absoluteFill, styles.writer, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
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
          style={{
            minWidth: 120,
            maxWidth: "100%",
            color: writing.look === "box" ? inkOn(writing.color) : writing.color,
            backgroundColor: writing.look === "box" ? writing.color : undefined,
            borderRadius: 10,
            paddingHorizontal: 12,
            fontSize: 30,
            fontFamily: familyOf(writing.font),
            fontWeight: familyOf(writing.font) ? "400" : "700",
            textAlign: "center",
            textShadowColor: writing.look === "outline" ? inkOn(writing.color) : writing.look === "box" ? undefined : shadow(writing.color),
            textShadowRadius: writing.look === "outline" ? 3 : 6,
          }}
        />
      </View>
      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {STORY_TEXT_LOOKS.map((look) => (
            <Pressable
              key={look}
              onPress={() => onChange({ ...writing, look })}
              accessibilityRole="button"
              accessibilityLabel={tr.stories.textLooks[look]}
              accessibilityState={{ selected: writing.look === look }}
              style={[styles.round, writing.look === look && styles.lookOn]}
            >
              <LookText text="A" look={look} color={writing.color} size={18} font="classic" />
            </Pressable>
          ))}
        </View>
        <Fonts value={writing.font} onChange={(font) => onChange({ ...writing, font })} />
        <Colors value={writing.color} onChange={(color) => onChange({ ...writing, color })} />
      </View>
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
