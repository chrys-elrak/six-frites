import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Logo } from "./logo";

export function BrandBar() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => router.navigate("/")}
      accessibilityRole="header"
      accessibilityLabel="Six Frites"
      style={[styles.bar, { paddingTop: Math.max(insets.top, 8), backgroundColor: t.bg, borderColor: t.border }]}
    >
      <Logo size={28} />
      <Text style={[styles.name, { color: t.text }]}>Six Frites</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: "700", letterSpacing: -0.3 },
});
