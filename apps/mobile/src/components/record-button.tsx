import * as Haptics from "expo-haptics";
import { ChevronUp, Lock, Mic, SendHorizontal, Video } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";

const HOLD_MS = 250;
const LOCK_PX = 70;
const CANCEL_PX = 110;

export type RecordMode = "voice" | "video";

interface Props {
  mode: RecordMode;
  state: "idle" | "holding" | "locked";
  disabled?: boolean;
  onToggle: () => void;
  onStart: (locked: boolean) => void;
  onLock: () => void;
  onRelease: () => void;
  onCancel: () => void;
  onSend: () => void;
  onSlide: (dx: number) => void;
}

/**
 * The mic / camera button. A tap switches between voice and video, holding records. While holding,
 * sliding up locks the recording hands-free and sliding left cancels it; letting go sends it. Once
 * locked it becomes the send button. TalkBack's long-press action starts a locked recording.
 */
export function RecordButton(props: Props) {
  const { mode, state, disabled } = props;
  const t = useTheme();
  const tr = useT();
  const latest = useRef(props);
  latest.current = props;
  const held = useRef(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(timer);
  }, [hint, mode]);

  const hold = usePanGesture({
    enabled: !disabled,
    runOnJS: true,
    activateAfterLongPress: HOLD_MS,
    onActivate: () => {
      const l = latest.current;
      if (l.state !== "idle") return;
      held.current = true;
      setHint(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      l.onStart(false);
    },
    onUpdate: (e) => {
      const l = latest.current;
      if (!held.current || l.state !== "holding") return;
      const dx = Math.min(0, e.translationX);
      l.onSlide(dx);
      if (e.translationY <= -LOCK_PX) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        l.onLock();
      } else if (dx <= -CANCEL_PX) {
        held.current = false;
        l.onCancel();
      }
    },
    onFinalize: () => {
      if (!held.current) return;
      held.current = false;
      if (latest.current.state === "holding") latest.current.onRelease();
    },
  });

  const tap = useTapGesture({
    enabled: !disabled,
    runOnJS: true,
    maxDuration: HOLD_MS,
    onActivate: () => {
      const l = latest.current;
      if (l.state === "locked") return l.onSend();
      if (l.state !== "idle") return;
      void Haptics.selectionAsync();
      l.onToggle();
      setHint(true);
    },
  });

  const gesture = useExclusiveGestures(hold, tap);
  const holdHint = mode === "voice" ? tr.composer.holdForVoice : tr.composer.holdForVideo;
  const label =
    state === "locked"
      ? mode === "voice"
        ? tr.composer.sendVoice
        : tr.composer.sendVideoNote
      : mode === "voice"
        ? tr.composer.recordVoice
        : tr.composer.recordVideoNote;

  return (
    <View>
      {state === "holding" && (
        <View
          accessibilityLabel={tr.composer.slideUpToLock}
          style={[styles.lock, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Lock size={16} color={t.muted} />
          <ChevronUp size={16} color={t.muted} />
        </View>
      )}
      {hint && state === "idle" && (
        <View style={[styles.hint, { backgroundColor: t.text }]} accessibilityLiveRegion="polite">
          <Text style={{ color: t.bg, fontSize: 13 }}>{holdHint}</Text>
        </View>
      )}
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={state === "idle" ? holdHint : undefined}
          accessibilityState={{ disabled: !!disabled }}
          accessibilityActions={[{ name: "activate" }, { name: "longpress" }]}
          onAccessibilityAction={(e) => {
            const l = latest.current;
            if (e.nativeEvent.actionName === "activate") {
              if (l.state === "locked") l.onSend();
              else if (l.state === "idle") l.onToggle();
            } else if (l.state === "idle") l.onStart(true);
          }}
          style={[
            styles.button,
            { opacity: disabled ? 0.4 : 1 },
            state === "holding" && { transform: [{ scale: 1.25 }] },
          ]}
        >
          {state === "locked" ? (
            <SendHorizontal size={20} color={brandInk} />
          ) : mode === "voice" ? (
            <Mic size={20} color={brandInk} />
          ) : (
            <Video size={20} color={brandInk} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: brand },
  lock: {
    position: "absolute",
    bottom: 52,
    left: 4,
    width: 32,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  hint: { position: "absolute", bottom: 48, right: 0, width: 220, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
