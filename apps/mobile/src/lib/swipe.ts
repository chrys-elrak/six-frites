import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { useLatest } from "./latest";
import { usePanGesture } from "react-native-gesture-handler";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const TRIGGER = 64;

/**
 * Drag a row sideways to fire `onRight` or `onLeft`, like the chat list in Messenger. Vertical drags fail the
 * gesture so the list keeps scrolling. `moving` slides the row and `right` or `left` fades in its hint on the
 * UI thread.
 */
export function useSwipeRow(onRight: (() => void) | null, onLeft: (() => void) | null) {
  const dx = useSharedValue(0);
  const pulled = useRef(0);
  const latest = useLatest({ onRight, onLeft });

  const gesture = usePanGesture({
    enabled: !!(onRight || onLeft),
    runOnJS: true,
    activeOffsetX: onRight && onLeft ? [-12, 12] : onLeft ? -12 : 12,
    failOffsetY: [-10, 10],
    onUpdate: (e) => {
      const side = e.translationX < 0 ? -1 : 1;
      const along = (side === 1 ? latest.current.onRight : latest.current.onLeft) ? Math.abs(e.translationX) : 0;
      const next = along < TRIGGER ? along : TRIGGER + (along - TRIGGER) / 3;
      if (next >= TRIGGER && Math.abs(pulled.current) < TRIGGER) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pulled.current = next * side;
      dx.value = next * side;
    },
    onFinalize: () => {
      if (pulled.current >= TRIGGER) latest.current.onRight?.();
      else if (pulled.current <= -TRIGGER) latest.current.onLeft?.();
      pulled.current = 0;
      dx.value = withTiming(0, { duration: 200 });
    },
  });

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const right = useAnimatedStyle(() => {
    const shown = Math.min(Math.max(dx.value, 0) / TRIGGER, 1);
    return { opacity: shown, transform: [{ scale: 0.5 + shown / 2 }] };
  });
  const left = useAnimatedStyle(() => {
    const shown = Math.min(Math.max(-dx.value, 0) / TRIGGER, 1);
    return { opacity: shown, transform: [{ scale: 0.5 + shown / 2 }] };
  });
  return { gesture, moving, right, left };
}

/** One-sided swipe, like replying in Messenger: right for their messages, left (`dir` -1) for yours. */
export function useSwipe(onSwipe: (() => void) | null, dir: 1 | -1) {
  const s = useSwipeRow(dir === 1 ? onSwipe : null, dir === -1 ? onSwipe : null);
  return { gesture: s.gesture, moving: s.moving, hint: dir === 1 ? s.right : s.left };
}
