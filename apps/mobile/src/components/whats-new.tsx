import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHANGELOG, type Release, unseenReleases } from "@six/shared";
import { ChevronRight, Sparkles, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import { Text } from "./text";
import { Card, IconButton } from "./ui";

const SEEN_KEY = "six:seen-release";

function ReleaseNotes({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const locale = useLocale((s) => s.locale);
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{tr.common.whatsNew}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: 20, paddingBottom: 8 }}>
            {releases.map((r) => (
              <View key={r.version} style={{ gap: 8 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>
                  {tr.common.version(r.version)}
                  <Text style={{ color: t.muted, fontWeight: "400" }}>
                    {" · "}
                    {new Date(r.date).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" })}
                  </Text>
                </Text>
                {r.notes[locale].map((note) => (
                  <View key={note} style={styles.note}>
                    <Text style={{ color: t.muted }}>•</Text>
                    <Text style={{ flex: 1, color: t.textSoft, fontSize: 15, lineHeight: 21 }}>{note}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function WhatsNew() {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.row}>
        <Sparkles size={20} color={brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.common.whatsNew}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr.common.version(CHANGELOG[0]!.version)}</Text>
        </View>
        <ChevronRight size={18} color={t.faint} />
      </Pressable>
      {open && <ReleaseNotes releases={CHANGELOG} onClose={() => setOpen(false)} />}
    </Card>
  );
}

/** Shows the releases that came with this update, or the newest one the first time the app opens. */
export function WhatsNewPrompt() {
  const [fresh, setFresh] = useState<Release[]>([]);

  useEffect(() => {
    void AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => setFresh(unseenReleases(seen)))
      .catch(() => null);
  }, []);

  if (!fresh.length) return null;

  function close() {
    setFresh([]);
    void AsyncStorage.setItem(SEEN_KEY, CHANGELOG[0]!.version).catch(() => null);
  }

  return <ReleaseNotes releases={fresh} onClose={close} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  note: { flexDirection: "row", gap: 8 },
});
