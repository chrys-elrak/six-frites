import type { PublicUser } from "@six/shared";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";

const sizes = { sm: 36, md: 56, lg: 80, xl: 120 };

export function Avatar({
  user,
  size = "sm",
  online = false,
}: {
  user: Pick<PublicUser, "displayName" | "avatarUrl">;
  size?: keyof typeof sizes;
  online?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const side = sizes[size];
  const box = { width: side, height: side, borderRadius: side / 2 };
  const dot = Math.round(side * 0.28);
  return (
    <View style={{ width: side, height: side }}>
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={box} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.initial, box]}>
          <Text style={[styles.letter, { fontSize: side * 0.38 }]}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      {online && (
        <View
          accessibilityLabel={tr.time.online}
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, borderColor: t.bg, borderWidth: Math.max(2, dot * 0.18) },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { backgroundColor: brand, alignItems: "center", justifyContent: "center" },
  letter: { color: brandInk, fontWeight: "600" },
  dot: { position: "absolute", right: 0, bottom: 0, backgroundColor: "#22c55e" },
});
