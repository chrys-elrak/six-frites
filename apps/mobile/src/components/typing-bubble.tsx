import type { TypingKind } from "@six/shared";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Text } from "./text";

function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-3, { duration: 280 }), withTiming(0, { duration: 280 })), -1));
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** Sits under the newest message while the other person is typing or recording, with what they're doing. */
export function TypingBubble({ kind }: { kind: TypingKind }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View pointerEvents="none" style={[styles.bubble, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.dots}>
        {[0, 150, 300].map((d) => (
          <Dot key={d} delay={d} color={t.muted} />
        ))}
      </View>
      <Text style={{ color: t.textSoft, fontSize: 12, fontWeight: "500" }}>{tr.chats.typing[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: "flex-start",
    marginLeft: 12,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dots: { flexDirection: "row", alignItems: "center", gap: 3, height: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
