import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react-native";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Text } from "./text";
import { Card, IconButton, ScreenHeader } from "./ui";

const KEY = "six:tip";
const today = () => new Date().toDateString();
const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * Today's tip about the app: a new one each day, the same on every device, going through the whole list in turn.
 * Closing it hides it until tomorrow.
 */
export function TipCard() {
  const t = useTheme();
  const tips = useT().tips;
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = JSON.parse(raw ?? "{}") as { closedOn?: string };
        if (saved.closedOn !== today()) setNext(dayNumber());
      })
      .catch(() => setNext(0));
  }, []);

  if (next === null) return null;

  function close() {
    void AsyncStorage.setItem(KEY, JSON.stringify({ closedOn: today() })).catch(() => null);
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

/** A row in Settings that opens every tip on their own screen, for whoever doesn't want to wait for them one a day. */
export function AllTips() {
  const t = useTheme();
  const tr = useT();
  return (
    <Card>
      <Pressable onPress={() => router.push("/tips")} accessibilityRole="button" style={styles.row}>
        <Lightbulb size={20} color={brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.tips.all}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr.tips.allHint(tr.tips.list.length)}</Text>
        </View>
        <ChevronRight size={18} color={t.faint} />
      </Pressable>
    </Card>
  );
}

/** Every tip, numbered, as a screen of its own. */
export function TipsScreen() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader background={t.bar}>
        <IconButton Icon={ChevronLeft} label={tr.common.back} size={26} onPress={() => router.back()} />
        <Lightbulb size={20} color={brand} />
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
  );
}
