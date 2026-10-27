import { type GeoPoint, coordsLabel, mapsUrl } from "@six/shared";
import { MapPin } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";

export function LocationCard({ point, mine }: { point: GeoPoint; mine: boolean }) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  return (
    <Pressable onPress={() => void Linking.openURL(mapsUrl(point))} accessibilityRole="link" style={styles.row}>
      <View style={[styles.icon, { backgroundColor: mine ? alpha(bubble.ink, 0.15) : "rgba(235,138,0,0.15)" }]}>
        <MapPin size={20} color={mine ? bubble.ink : brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg, fontSize: 15, fontWeight: "600" }}>{tr.summary.kinds.location}</Text>
        <Text numberOfLines={1} style={{ color: fg, fontSize: 13, opacity: 0.75 }}>
          {coordsLabel(point)}
          {point.accuracy ? ` · ${tr.messages.within(Math.round(point.accuracy))}` : ""}
        </Text>
        <Text style={{ color: fg, fontSize: 13, fontWeight: "500", textDecorationLine: "underline" }}>
          {tr.messages.openInMaps}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Where the phone is now. Rejects with "denied" when location access was refused. The module loads
 * here rather than at the top so builds made before it was added still open chats.
 */
export async function currentPosition(): Promise<GeoPoint> {
  const Location = await import("expo-location").catch(() => {
    throw new Error("failed");
  });
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw new Error("denied");
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => {
    throw new Error("failed");
  });
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy === null ? null : Math.min(Math.round(p.coords.accuracy), 100_000),
  };
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, width: 256, maxWidth: "100%", paddingVertical: 4 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
