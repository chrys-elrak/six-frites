import AsyncStorage from "@react-native-async-storage/async-storage";
import { unwrap } from "@six/sdk";
import { type LatestAppDTO, isNewerVersion } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Download, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "./text";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { IconButton } from "./ui";

const SKIPPED_KEY = "six:skipped-update";

/** The newest Android release when it is newer than this app, or null. */
function useNewRelease() {
  const latest = useQuery({
    queryKey: ["app", "android"],
    queryFn: async () => unwrap(await six.api.GET("/v1/app/android")),
    enabled: Platform.OS === "android",
    staleTime: 6 * 60 * 60 * 1000,
  });
  const release = latest.data;
  return release && isNewerVersion(release.version, Constants.expoConfig?.version ?? "0") ? release : null;
}

function Offer({ release, onSkip, style }: { release: LatestAppDTO; onSkip?: () => void; style?: ViewStyle }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={[styles.banner, { backgroundColor: t.chip }, style]}>
      <Download size={20} color={brand} />
      <Text style={[styles.text, { color: t.text }]}>{tr.common.newVersion(release.version)}</Text>
      <Pressable onPress={() => void Linking.openURL(release.downloadUrl)} style={styles.button} hitSlop={6}>
        <Text style={{ color: brandInk, fontWeight: "700" }}>{tr.common.update}</Text>
      </Pressable>
      {onSkip && <IconButton Icon={X} label={tr.common.dismiss} onPress={onSkip} size={18} />}
    </View>
  );
}

/** Offers the newest Android release on the chat list, until it is installed or skipped. */
export function UpdateBanner() {
  const [skipped, setSkipped] = useState<string | null | undefined>(undefined);
  const release = useNewRelease();

  useEffect(() => {
    void AsyncStorage.getItem(SKIPPED_KEY)
      .then(setSkipped)
      .catch(() => setSkipped(null));
  }, []);

  if (!release || skipped === undefined || skipped === release.version) return null;

  function skip() {
    setSkipped(release!.version);
    void AsyncStorage.setItem(SKIPPED_KEY, release!.version).catch(() => null);
  }

  return <Offer release={release} onSkip={skip} />;
}

/** The same offer at the top of settings, where skipping it on the chat list doesn't hide it. */
export function UpdateCard() {
  const release = useNewRelease();
  return release ? <Offer release={release} style={{ margin: 0 }} /> : null;
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, marginBottom: 4, padding: 12, borderRadius: 14 },
  text: { flex: 1, fontSize: 14, fontWeight: "500" },
  button: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
});
