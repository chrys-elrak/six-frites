import { LABEL_FONTS, type TextFont, textColor, textSize } from "@six/shared";
import { useEffect } from "react";
import { type TextStyle, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
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

function Dots({ ink, step, r }: { ink: string; step: number; r: number }) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern id={`dots${step}`} width={step} height={step} patternUnits="userSpaceOnUse">
          <Circle cx={step / 2} cy={step / 2} r={r} fill={ink} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#dots${step})`} />
    </Svg>
  );
}

/**
 * Hidden spoiler text drawn like the web's: drifting dots where the words are. Part of a line can't take a moving
 * background, so each word is a little box inside the line, sized by an invisible copy of the word. `font` is the
 * surrounding text's size, which doesn't reach into those boxes.
 */
export function Spoiler({
  text,
  style,
  font,
  ink,
  label,
  onPress,
}: {
  text: string;
  style: TextStyle;
  font: TextStyle;
  ink: string;
  label?: string;
  onPress?: () => void;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.linear }), -1, true);
  }, [drift]);
  const near = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value * 6 }, { translateY: drift.value * 4 }] }));
  const far = useAnimatedStyle(() => ({ transform: [{ translateX: 3 - drift.value * 6 }, { translateY: 2 + drift.value * 4 }] }));
  const size = style.fontSize ?? font.fontSize ?? 15;
  const hidden: TextStyle = { color: "transparent", backgroundColor: "transparent", textShadowRadius: 0, lineHeight: size };
  return text.split(/(\s+)/).map((word, i) =>
    !word ? null : /\s/.test(word) ? (
      <Text key={i} onPress={onPress}>
        {word}
      </Text>
    ) : (
      <View key={i} style={{ height: size, overflow: "hidden", borderRadius: 4, transform: [{ translateY: size * 0.2 }] }}>
        <Text accessibilityLabel={label} onPress={onPress} style={[font, style, hidden]}>
          {word}
        </Text>
        <Animated.View style={[dotsBox, near]}>
          <Dots ink={ink} step={5} r={0.7} />
        </Animated.View>
        <Animated.View style={[dotsBox, far]}>
          <Dots ink={ink} step={7} r={0.6} />
        </Animated.View>
      </View>
    ),
  );
}

const dotsBox = { position: "absolute", top: -8, left: -8, right: -8, bottom: -8, pointerEvents: "none" } as const;
