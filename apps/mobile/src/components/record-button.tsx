import * as Haptics from "expo-haptics";
import { Mic, SendHorizontal, Video } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";

export type RecordMode = "voice" | "video";

interface Props {
  mode: RecordMode;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onStart: () => void;
  onSend: () => void;
}

/**
 * The mic / camera button. A tap starts recording and turns it into the send button. A long press
 * switches between voice and video.
 */
export function RecordButton({ mode, active, disabled, onToggle, onStart, onSend }: Props) {
  const t = useTheme();
  const tr = useT();
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(timer);
  }, [hint, mode]);

  const tapHint = mode === "voice" ? tr.composer.tapForVoice : tr.composer.tapForVideo;
  const label = active
    ? mode === "voice"
      ? tr.composer.sendVoice
      : tr.composer.sendVideoNote
    : mode === "voice"
      ? tr.composer.recordVoice
      : tr.composer.recordVideoNote;

  return (
    <View>
      {hint && !active && (
        <View style={[styles.hint, { backgroundColor: t.text }]} accessibilityLiveRegion="polite">
          <Text style={{ color: t.bg, fontSize: 13 }}>{tapHint}</Text>
        </View>
      )}
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={active ? undefined : tapHint}
        onPress={() => {
          setHint(false);
          if (active) return onSend();
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onStart();
        }}
        onLongPress={() => {
          if (active) return;
          void Haptics.selectionAsync();
          onToggle();
          setHint(true);
        }}
        style={({ pressed }) => [
          styles.button,
          { opacity: disabled ? 0.4 : 1 },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        {active ? (
          <SendHorizontal size={20} color={brandInk} />
        ) : mode === "voice" ? (
          <Mic size={20} color={brandInk} />
        ) : (
          <Video size={20} color={brandInk} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: brand },
  hint: { position: "absolute", bottom: 48, right: 0, width: 220, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
