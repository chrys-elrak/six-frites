import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Text } from "./text";
import { Card, IconButton, ScreenHeader } from "./ui";

const KEY = "six:tip";
const today = () => new Date().toDateString();

/**
 * One tip about the app at a time, at most one a day: closing it moves on to the next one, shown the next day, and
 * the list starts over once it's done. Kept per device, so a fresh one doesn't follow you around.
 */
export function TipCard() {
  const t = useTheme();
  const tips = useT().tips;
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = JSON.parse(raw ?? "{}") as { next?: number; closedOn?: string };
        if (saved.closedOn !== today()) setNext(saved.next ?? 0);
      })
      .catch(() => setNext(0));
  }, []);

  if (next === null) return null;

  function close() {
    void AsyncStorage.setItem(KEY, JSON.stringify({ next: next! + 1, closedOn: today() })).catch(() => null);
    setNext(null);
  }

  return (
    <View style={[styles.card, { borderColor: "rgba(235,138,0,0.25)" }]}>
      <View style={styles.icon}>
        <Lightbulb size={20} color={brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: brand, fontSize: 14, fontWeight: "700" }}>{tips.title}</Text>
        <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{tips.list[next % tips.list.length]}</Text>
      </View>
      <Pressable onPress={close} hitSlop={6} style={styles.button}>
        <Text style={{ color: brandInk, fontWeight: "700", fontSize: 14 }}>{tips.next}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  tip: { flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(235,138,0,0.10)",
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(235,138,0,0.2)" },
  button: { backgroundColor: brand, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
});

/** A row in Settings that opens every tip at once, for whoever doesn't want to wait for them one a day. */
export function AllTips() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.row}>
        <Lightbulb size={20} color={brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.tips.all}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr.tips.allHint(tr.tips.list.length)}</Text>
        </View>
        <ChevronRight size={18} color={t.faint} />
      </Pressable>
      {open && (
        <Modal animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: t.bg }}>
            <ScreenHeader background={t.bar}>
              <IconButton Icon={ChevronLeft} label={tr.common.close} size={26} onPress={() => setOpen(false)} />
              <Text style={{ flex: 1, color: t.text, fontSize: 18, fontWeight: "700" }}>{tr.tips.all}</Text>
            </ScreenHeader>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
              {tr.tips.list.map((tip, i) => (
                <View key={i} style={[styles.tip, { borderColor: t.border }, i === 0 && { borderTopWidth: 0 }]}>
                  <Text style={{ width: 24, textAlign: "right", color: brand, fontWeight: "700", fontSize: 14 }}>{i + 1}</Text>
                  <Text style={{ flex: 1, color: t.textSoft, fontSize: 15, lineHeight: 21 }}>{tip}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}
    </Card>
  );
}
