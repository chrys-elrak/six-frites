import { LABEL_FONTS, type TextFont, textColor, textSize } from "@six/shared";
import type { TextStyle } from "react-native";
import { type Segment, gradientLetters } from "@/lib/markup";
import { Text } from "./text";

/** One colour for a colour range value: itself, or a gradient's first colour where a gradient can't be drawn. */
const firstColor = (value: string | undefined) => {
  const paint = textColor(value);
  return paint ? ("solid" in paint ? paint.solid : paint.gradient[0]) : null;
};

export function styleFor(seg: Segment, codeBg: string): TextStyle {
  const { styles } = seg;
  const line = [styles.has("underline") && "underline", styles.has("strike") && "line-through"].filter(Boolean).join(" ");
  const family = seg.font && LABEL_FONTS[seg.font as TextFont];
  const paint = textColor(seg.color);
  const points = textSize(seg.size);
  const behind = firstColor(seg.highlight);
  const around = firstColor(seg.outline);
  return {
    ...(styles.has("bold") && { fontWeight: "700" }),
    ...(styles.has("italic") && { fontStyle: "italic" }),
    ...(line && { textDecorationLine: line as TextStyle["textDecorationLine"] }),
    ...(styles.has("code") && { fontFamily: "monospace", fontSize: 14, backgroundColor: codeBg }),
    ...(family && { fontFamily: family }),
    ...(points && { fontSize: points, lineHeight: Math.round(points * 1.25) }),
    ...(paint && "solid" in paint && { color: paint.solid }),
    ...(behind && { backgroundColor: behind }),
    ...(around && { textShadowColor: around, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }),
  };
}

/** A gradient's text letter by letter in its colours, since text can't be filled with a gradient here; null otherwise. */
export function GradientText({ seg }: { seg: Segment }) {
  const letters = gradientLetters(seg);
  if (letters.length === 1 && !letters[0]!.color) return null;
  return letters.map((l, i) => (
    <Text key={i} style={{ color: l.color }}>
      {l.text}
    </Text>
  ));
}
