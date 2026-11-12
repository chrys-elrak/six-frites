import { CheckCircle2, TriangleAlert, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useStoryPost } from "@/lib/story-post";
import { brand, useTheme } from "@/lib/theme";
import { Text } from "./text";

/** Follows a story being shared in the background: its progress, then that it's up, or a retry if it failed. */
export function StoryPostBar() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { kind, state, progress, retry } = useStoryPost();
  if (!state) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top + 8 }]} accessibilityLiveRegion="polite">
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.row}>
          {state === "posting" && <ActivityIndicator size="small" color={brand} />}
          {state === "done" && <CheckCircle2 size={20} color="#16a34a" />}
          {state === "failed" && <TriangleAlert size={20} color={t.danger} />}
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: "600" }}>
            {state === "posting"
              ? kind === "note"
                  ? tr.stories.postingNote
                  : `${tr.stories.postingStory} ${Math.round(progress * 100)}%`
              : state === "done"
                ? kind === "note"
                    ? tr.stories.notePosted
                    : tr.stories.posted
                : tr.stories.couldNotPostShort}
          </Text>
          {state === "failed" && (
            <Pressable onPress={() => retry?.()} hitSlop={8}>
              <Text style={{ color: brand, fontSize: 14, fontWeight: "700" }}>{tr.common.retry}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => useStoryPost.setState({ state: null, retry: null })}
            accessibilityLabel={tr.common.dismiss}
            hitSlop={8}
          >
            <X size={18} color={t.muted} />
          </Pressable>
        </View>
        {state === "posting" && (
          <View style={{ height: 3, backgroundColor: "rgba(0,0,0,0.06)" }}>
            <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: brand }} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", paddingHorizontal: 12 },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
