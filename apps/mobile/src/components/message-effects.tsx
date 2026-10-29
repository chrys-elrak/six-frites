import AsyncStorage from "@react-native-async-storage/async-storage";
import { MessageEffect } from "@six/shared";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type LayoutRectangle, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { create } from "zustand";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Text } from "./text";

const KEY = "six:effects-seen";

/** Which effects this device already played and which gifts it opened, so neither happens twice. */
const useSeen = create<{ ready: boolean; ids: string[] }>(() => ({ ready: false, ids: [] }));

void AsyncStorage.getItem(KEY)
  .then((saved) => useSeen.setState({ ready: true, ids: saved ? JSON.parse(saved) : [] }))
  .catch(() => useSeen.setState({ ready: true }));

function markSeen(id: string) {
  const ids = [...useSeen.getState().ids, id].slice(-500);
  useSeen.setState({ ids });
  void AsyncStorage.setItem(KEY, JSON.stringify(ids)).catch(() => null);
}

const CONFETTI = ["#f97316", "#facc15", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];

function useLoop(ms: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, ms, delay]);
  return v;
}

function Flame({ delay }: { delay: number }) {
  const v = useLoop(900, delay);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  return <Animated.Text style={{ fontSize: 13, transform: [{ translateY }, { scale }] }}>🔥</Animated.Text>;
}

function Fire({ radius }: { radius: ViewStyle }) {
  const glow = useLoop(1600);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[StyleSheet.absoluteFill, radius, { borderWidth: 2, borderColor: "#f97316", opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}
      />
      <View style={styles.flames}>
        {[0, 1, 2, 3].map((i) => (
          <Flame key={i} delay={i * 160} />
        ))}
      </View>
    </View>
  );
}

function Gift({ radius, onOpen }: { radius: ViewStyle; onOpen: () => void }) {
  const tr = useT();
  const v = useLoop(1400);
  const rotate = v.interpolate({ inputRange: [0, 0.4, 0.6, 0.8, 1], outputRange: ["0deg", "0deg", "-12deg", "12deg", "0deg"] });
  return (
    <Pressable onPress={onOpen} accessibilityLabel={tr.messages.openGift} style={[StyleSheet.absoluteFill, radius, styles.gift]}>
      <View style={styles.ribbonV} />
      <View style={styles.ribbonH} />
      <Animated.Text style={{ fontSize: 20, transform: [{ rotate }] }}>🎀</Animated.Text>
    </Pressable>
  );
}

function Particle({ effect, i, n }: { effect: "hearts" | "confetti"; i: number; n: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 1600,
      delay: (i % 6) * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, i]);
  const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
  const reach = 50 + ((i * 37) % 40);
  const dx = effect === "hearts" ? ((i % 5) - 2) * 6 : Math.cos(angle) * reach;
  const dy = effect === "hearts" ? -60 - ((i * 13) % 50) : Math.sin(angle) * reach - 20;
  const style = {
    position: "absolute" as const,
    top: "50%" as const,
    left: `${effect === "hearts" ? 8 + ((i * 29) % 84) : 50}%` as const,
    opacity: v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i * 47) % 360}deg`] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
    ],
  };
  return effect === "hearts" ? (
    <Animated.Text style={[style, { fontSize: 18 }]}>❤️</Animated.Text>
  ) : (
    <Animated.View style={[style, { width: 6, height: 10, borderRadius: 1, backgroundColor: CONFETTI[i % CONFETTI.length] }]} />
  );
}

/**
 * Draws a text bubble's effect on top of it, placed over `box` (the bubble's layout in the same parent). `id` stays
 * the same from sending to sent, so hearts and confetti play once and a gift stays open.
 */
export function EffectLayer({ effect, id, box, radius }: { effect: MessageEffect; id: string; box: LayoutRectangle; radius: ViewStyle }) {
  const ready = useSeen((s) => s.ready);
  const opened = useSeen((s) => s.ids.includes(`gift:${id}`));
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!ready || (effect !== "hearts" && effect !== "confetti")) return;
    if (useSeen.getState().ids.includes(`play:${id}`)) return;
    markSeen(`play:${id}`);
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 2200);
    return () => clearTimeout(t);
  }, [ready, effect, id]);

  const at: ViewStyle = { position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height };
  if (effect === "fire") {
    return (
      <View pointerEvents="none" style={at}>
        <Fire radius={radius} />
      </View>
    );
  }
  if (effect === "gift") {
    if (!ready || opened) return null;
    return (
      <View style={at}>
        <Gift radius={radius} onOpen={() => markSeen(`gift:${id}`)} />
      </View>
    );
  }
  if (!burst) return null;
  const n = effect === "hearts" ? 9 : 26;
  return (
    <View pointerEvents="none" style={at}>
      {Array.from({ length: n }, (_, i) => (
        <Particle key={i} effect={effect} i={i} n={n} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flames: { position: "absolute", left: 4, right: 4, top: -14, flexDirection: "row", justifyContent: "space-around" },
  gift: { backgroundColor: "#ec4899", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ribbonV: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 10, marginLeft: -5, backgroundColor: "rgba(255,255,255,0.9)" },
  ribbonH: { position: "absolute", left: 0, right: 0, top: "50%", height: 10, marginTop: -5, backgroundColor: "rgba(255,255,255,0.9)" },
});
