import AsyncStorage from "@react-native-async-storage/async-storage";
import { unwrap } from "@six/sdk";
import { isNewerVersion } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Download, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { IconButton } from "./ui";

const SKIPPED_KEY = "six:skipped-update";

/** Offers the newest Android release when it is newer than this app, until it is installed or skipped. */
export function UpdateBanner() {
  const t = useTheme();
  const tr = useT();
  const [skipped, setSkipped] = useState<string | null | undefined>(undefined);
  const latest = useQuery({
    queryKey: ["app", "android"],
    queryFn: async () => unwrap(await six.api.GET("/v1/app/android")),
    enabled: Platform.OS === "android",
    staleTime: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    void AsyncStorage.getItem(SKIPPED_KEY)
      .then(setSkipped)
      .catch(() => setSkipped(null));
  }, []);

  const release = latest.data;
  if (!release || skipped === undefined || skipped === release.version) return null;
  if (!isNewerVersion(release.version, Constants.expoConfig?.version ?? "0")) return null;

  function skip() {
    setSkipped(release!.version);
    void AsyncStorage.setItem(SKIPPED_KEY, release!.version).catch(() => null);
  }

  return (
    <View style={[styles.banner, { backgroundColor: t.chip }]}>
      <Download size={20} color={brand} />
      <Text style={[styles.text, { color: t.text }]}>{tr.common.newVersion(release.version)}</Text>
      <Pressable onPress={() => void Linking.openURL(release.downloadUrl)} style={styles.button} hitSlop={6}>
        <Text style={{ color: brandInk, fontWeight: "700" }}>{tr.common.update}</Text>
      </Pressable>
      <IconButton Icon={X} label={tr.common.dismiss} onPress={skip} size={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, marginBottom: 4, padding: 12, borderRadius: 14 },
  text: { flex: 1, fontSize: 14, fontWeight: "500" },
  button: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
});
