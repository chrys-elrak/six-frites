import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Logo } from "./logo";

export function BrandBar({ children }: { children?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, 8), backgroundColor: t.glass, borderColor: t.border }]}>
      <Pressable
        onPress={() => router.navigate("/")}
        accessibilityRole="header"
        accessibilityLabel="Six Frites"
        style={styles.brand}
      >
        <Logo size={28} />
        <Text style={[styles.name, { color: t.text }]}>Six Frites</Text>
      </Pressable>
      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginVertical: -6 },
  name: { fontSize: 15, fontWeight: "700", letterSpacing: -0.3 },
});
