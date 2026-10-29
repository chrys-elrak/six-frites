import { router } from "expo-router";
import { X } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useToasts } from "@/lib/notify";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";

export function Toasts() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top + 8 }]} accessibilityLiveRegion="polite">
      {toasts.map((toast) => (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(180)}
          exiting={FadeOutUp.duration(150)}
          style={[styles.toast, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Pressable
            onPress={() => {
              dismiss(toast.id);
              router.push(`/chats/${toast.chatId}`);
            }}
            style={styles.body}
          >
            <Avatar user={toast.avatar} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>
                {toast.title}
              </Text>
              <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>
                {toast.body}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => dismiss(toast.id)} accessibilityLabel={tr.common.dismiss} hitSlop={8} style={styles.close}>
            <X size={16} color={t.faint} />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", gap: 8, paddingHorizontal: 12 },
  toast: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
