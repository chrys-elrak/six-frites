import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
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

/** Sits under the newest message while someone is typing or recording, with what they're doing and, in a group, who. */
export function TypingBubble({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={[styles.bubble, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.dots}>
        {[0, 150, 300].map((d) => (
          <Dot key={d} delay={d} color={t.muted} />
        ))}
      </View>
      <Text style={{ color: t.textSoft, fontSize: 12, fontWeight: "500" }}>{label}</Text>
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
