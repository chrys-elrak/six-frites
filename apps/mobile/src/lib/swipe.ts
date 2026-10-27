import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { usePanGesture } from "react-native-gesture-handler";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const TRIGGER = 64;

/**
 * Drag a message toward the middle to fire `onSwipe`, like replying in Messenger: right for their messages,
 * left (`dir` -1) for yours. Vertical drags fail the gesture so the list keeps scrolling. `moving` slides the
 * message and `hint` fades in the reply icon on the UI thread.
 */
export function useSwipe(onSwipe: (() => void) | null, dir: 1 | -1) {
  const dx = useSharedValue(0);
  const pulled = useRef(0);
  const latest = useRef(onSwipe);
  latest.current = onSwipe;

  const gesture = usePanGesture({
    enabled: !!onSwipe,
    runOnJS: true,
    activeOffsetX: dir * 12,
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      const x = Math.max(0, e.translationX * dir);
      const next = x < TRIGGER ? x : TRIGGER + (x - TRIGGER) / 3;
      if (next >= TRIGGER && pulled.current < TRIGGER) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pulled.current = next;
      dx.value = next;
    },
    onFinalize: () => {
      if (pulled.current >= TRIGGER) latest.current?.();
      pulled.current = 0;
      dx.value = withTiming(0, { duration: 200 });
    },
  });

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value * dir }] }));
  const hint = useAnimatedStyle(() => {
    const shown = Math.min(dx.value / TRIGGER, 1);
    return { opacity: shown, transform: [{ scale: 0.5 + shown / 2 }] };
  });
  return { gesture, moving, hint };
}
