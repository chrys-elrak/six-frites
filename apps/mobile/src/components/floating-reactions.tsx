import { useCallback, useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";

export interface Floater {
  id: number;
  emoji: string;
  mine: boolean;
}

function FloatingEmoji({ id, emoji, mine }: Floater) {
  const { height } = useWindowDimensions();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = Animated.timing(t, { toValue: 1, duration: 2800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [t]);
  return (
    <Animated.Text
      style={[
        styles.floating,
        {
          left: `${(mine ? 58 : 12) + ((id * 37) % 26)}%`,
          opacity: t.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.55] }) },
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, id % 2 ? 28 : -28] }) },
            { scale: t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.5, 1.25, 1] }) },
          ],
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

/** Emojis that rise and fade over whatever fills the screen, like reactions during a call. */
export function FloatingReactions({ reactions }: { reactions: Floater[] }) {
  if (!reactions.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {reactions.map((r) => (
        <FloatingEmoji key={r.id} {...r} />
      ))}
    </View>
  );
}

let next = 0;

/** Emojis to float for a few seconds each, spread across the screen, and a way to add one. */
export function useFloaters() {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const add = useCallback((emoji: string) => {
    const id = ++next;
    setFloaters((all) => [...all.slice(-20), { id, emoji, mine: id % 2 === 0 }]);
    setTimeout(() => setFloaters((all) => all.filter((f) => f.id !== id)), 3000);
  }, []);
  return [floaters, add] as const;
}

const styles = StyleSheet.create({
  floating: { position: "absolute", bottom: 150, fontSize: 44 },
});
