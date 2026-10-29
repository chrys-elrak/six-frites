import { router, usePathname } from "expo-router";
import { Pause, Play, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { pauseVoice, playVoice, stopVoice, useVoice } from "@/lib/playback";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { SpeedButton } from "./attachment";
import { Text } from "./text";

/** The voice message playing from a chat you're not looking at, if any. */
export function useMiniPlayer() {
  const pathname = usePathname();
  const track = useVoice((s) => s.track);
  return track?.chatId && pathname !== `/chats/${track.chatId}` ? track : null;
}

/** A bar over every screen for the voice message still playing after you left its chat. Signing out stops it. */
export function MiniPlayer() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const track = useMiniPlayer();
  const { playing, position, duration } = useVoice();
  useEffect(() => stopVoice, []);
  if (!track) return null;
  const chatId = track.chatId!;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6, backgroundColor: t.surface, borderColor: t.border }]}>
      <Pressable
        onPress={() => (playing ? pauseVoice() : playVoice(track))}
        accessibilityLabel={playing ? tr.messages.pause : tr.messages.playVoice}
        style={styles.play}
      >
        {playing ? (
          <Pause size={16} color={brandInk} fill={brandInk} />
        ) : (
          <Play size={16} color={brandInk} fill={brandInk} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
      <Pressable onPress={() => router.push(`/chats/${chatId}`)} style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>
          {track.title}
        </Text>
        <Text style={{ color: t.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
          {tr.summary.kinds.voice} · {formatDuration(position)}
          {duration > 0 ? ` / ${formatDuration(duration)}` : ""}
        </Text>
      </Pressable>
      <SpeedButton tint={brand} bg="rgba(235,138,0,0.15)" />
      <Pressable onPress={stopVoice} accessibilityLabel={tr.common.close} hitSlop={8} style={styles.close}>
        <X size={18} color={t.muted} />
      </Pressable>
      <View style={[styles.progress, { width: `${duration ? (position / duration) * 100 : 0}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: brand, alignItems: "center", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  progress: { position: "absolute", left: 0, bottom: 0, height: 2, backgroundColor: brand },
});
