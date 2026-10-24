import type { PublicUser } from "@six/shared";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { brand, brandInk } from "@/lib/theme";

const sizes = { sm: 36, md: 56, lg: 80 };

export function Avatar({
  user,
  size = "sm",
}: {
  user: Pick<PublicUser, "displayName" | "avatarUrl">;
  size?: keyof typeof sizes;
}) {
  const side = sizes[size];
  const box = { width: side, height: side, borderRadius: side / 2 };
  if (user.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={box} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[styles.initial, box]}>
      <Text style={[styles.letter, { fontSize: side * 0.38 }]}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { backgroundColor: brand, alignItems: "center", justifyContent: "center" },
  letter: { color: brandInk, fontWeight: "600" },
});
