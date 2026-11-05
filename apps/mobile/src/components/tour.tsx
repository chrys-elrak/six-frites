import { unwrap } from "@six/sdk";
import { ChevronRight, Compass } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Text } from "./text";
import { Card, PrimaryButton, TextButton } from "./ui";

const ART = ["🍟", null, "💌", "🤫", "🎲"];
const SAMPLE = { displayName: "#EF4535", avatarUrl: null };

/** Remembers the tour as seen for this account, so no app shows it on its own again. */
export function markTourSeen() {
  const { user, setUser } = useSession.getState();
  if (!user || user.tourSeen) return;
  setUser({ ...user, tourSeen: true });
  void six.api
    .PATCH("/v1/me", { body: { tourSeen: true } })
    .then((r) => setUser(unwrap(r)))
    .catch(() => null);
}

/** A few cards that swipe sideways, on how the app works, for someone new or anyone who asks for them again. */
export function Tour({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const track = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState(0);
  const cards = tr.tour.cards;
  const last = at === cards.length - 1;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <ScrollView
            ref={track}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onMomentumScrollEnd={(e) => width && setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {cards.map((c, i) => (
              <View key={c.title} style={[styles.page, { width }]}>
                {ART[i] ? (
                  <View style={[styles.art, { backgroundColor: `${brand}26` }]}>
                    <Text style={styles.emoji}>{ART[i]}</Text>
                  </View>
                ) : (
                  <Avatar user={SAMPLE} size="lg" />
                )}
                <Text style={[styles.title, { color: t.text }]}>{c.title}</Text>
                <Text style={[styles.body, { color: t.textSoft }]}>{c.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            {cards.map((c, i) => (
              <View
                key={c.title}
                style={[styles.dot, i === at ? { width: 20, backgroundColor: brand } : { backgroundColor: t.border }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <View style={{ opacity: last ? 0 : 1 }}>
              <TextButton title={tr.tour.skip} onPress={onClose} disabled={last} />
            </View>
            <PrimaryButton
              title={last ? tr.tour.start : tr.common.next}
              onPress={() => {
                if (last) return onClose();
                track.current?.scrollTo({ x: (at + 1) * width });
                setAt(at + 1);
              }}
              style={{ minWidth: 120 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function TourAgain() {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.row}>
        <Compass size={20} color={brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.tour.again}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr.tour.againHint}</Text>
        </View>
        <ChevronRight size={18} color={t.faint} />
      </Pressable>
      {open && <Tour onClose={() => setOpen(false)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { borderRadius: 24, overflow: "hidden" },
  page: { alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8 },
  art: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 44, lineHeight: 56, includeFontPadding: false },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 12 },
  dot: { height: 6, width: 6, borderRadius: 3 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
});
