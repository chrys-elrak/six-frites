import { router } from "expo-router";
import { MessageCircle, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import Animated, { Easing, FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { type Toast, useToasts } from "@/lib/notify";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useTheme();
  const tr = useT();
  const life = useSharedValue(1);
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: life.value }] }));

  useEffect(() => {
    life.value = withTiming(0, { duration: 5000, easing: Easing.linear });
  }, [life]);

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(16)}
      exiting={FadeOutUp.duration(160)}
      style={[styles.toast, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      <Pressable
        onPress={() => {
          onDismiss();
          router.push(`/chats/${toast.chatId}`);
        }}
        style={({ pressed }) => [styles.body, pressed && { opacity: 0.7 }]}
      >
        <View>
          <Avatar user={toast.avatar} />
          <View style={[styles.badge, { borderColor: t.surface }]}>
            <MessageCircle size={10} color={brandInk} fill={brandInk} />
          </View>
        </View>
        <View style={{ flex: 1, paddingTop: 1 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>
            {toast.title}
          </Text>
          <Text numberOfLines={2} style={{ color: t.textSoft, fontSize: 14, lineHeight: 19, marginTop: 1 }}>
            {toast.body}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityLabel={tr.common.dismiss} hitSlop={8} style={styles.close}>
        <X size={16} color={t.faint} />
      </Pressable>
      <Animated.View style={[styles.bar, bar]} />
    </Animated.View>
  );
}

export function Toasts() {
  const insets = useSafeAreaInsets();
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top + 8 }]} accessibilityLiveRegion="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", gap: 10, paddingHorizontal: 12 },
  toast: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  body: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, paddingRight: 4 },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
  },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", margin: 10 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: brand, transformOrigin: "left" },
});
