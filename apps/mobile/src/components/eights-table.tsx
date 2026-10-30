import { type EightsView, type LiveRoomDTO, RANKS, SUITS, cardRank, cardSuit, eightsFits } from "@six/shared";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";
import type { Play } from "./live";
import { Text } from "./text";
import { TextButton } from "./ui";

const red = (suit: number) => suit === 1 || suit === 2;
const ink = (suit: number) => (red(suit) ? "#dc2626" : "#1c1917");

function CardFace({ card, raised, dim }: { card: number; raised?: boolean; dim?: boolean }) {
  const suit = cardSuit(card);
  return (
    <View style={[styles.card, raised && { transform: [{ translateY: -10 }], borderColor: brand }, dim && { opacity: 0.55 }]}>
      <Text style={{ color: ink(suit), fontSize: 15, fontWeight: "800" }}>{RANKS[cardRank(card)]}</Text>
      <Text style={{ color: ink(suit), fontSize: 28, textAlign: "center" }}>{SUITS[suit]}</Text>
    </View>
  );
}

function CardBack({ small }: { small?: boolean }) {
  return (
    <View style={[styles.card, styles.back, small && styles.small]}>
      <Text style={{ fontSize: small ? 14 : 22 }}>🍟</Text>
    </View>
  );
}

export function EightsTable({
  room,
  state,
  nameOf,
  play,
}: {
  room: LiveRoomDTO;
  state: EightsView;
  nameOf: (seat: number) => string;
  play: Play;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [choosing, setChoosing] = useState<number | null>(null);
  const me = room.mySeat;
  const mine = me !== null && state.turn === me && room.status === "playing";
  const top = state.pile.at(-1)!;
  const hand = [...state.hand].sort((a, b) => a - b);

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.others}>
        {state.counts.map((n, i) =>
          i === me ? null : (
            <View key={i} style={[styles.other, { borderColor: state.turn === i ? brand : t.border, backgroundColor: t.surface }]}>
              <CardBack small />
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: "600", maxWidth: 90 }}>
                {nameOf(i)}
              </Text>
              <Text style={{ color: t.muted, fontSize: 11 }}>{tr.live.cards(n)}</Text>
            </View>
          ),
        )}
      </View>
      <View style={styles.middle}>
        <Pressable
          disabled={!mine || state.drawn}
          onPress={() => void play({ draw: true })}
          accessibilityRole="button"
          accessibilityLabel={tr.live.draw}
          style={{ alignItems: "center", gap: 4, opacity: !mine || state.drawn ? 0.6 : 1 }}
        >
          <CardBack />
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {tr.live.draw} · {state.drawCount}
          </Text>
        </Pressable>
        <CardFace card={top} />
        {state.suit !== cardSuit(top) && (
          <View style={[styles.suit, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ color: ink(state.suit), fontSize: 34 }}>{SUITS[state.suit]}</Text>
          </View>
        )}
      </View>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={{ color: mine ? brand : t.text, fontSize: 16, fontWeight: "700" }}>
          {mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}
        </Text>
        {mine && state.drawn && <TextButton title={tr.live.pass} color={brand} onPress={() => void play({ pass: true })} />}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand}>
        {hand.map((card) => {
          const playable = mine && eightsFits(state, card);
          return (
            <Pressable
              key={card}
              disabled={!playable}
              onPress={() => (cardRank(card) === 7 ? setChoosing(card) : void play({ play: card }))}
              accessibilityRole="button"
              accessibilityLabel={`${RANKS[cardRank(card)]} ${tr.live.suits[cardSuit(card)]}`}
            >
              <CardFace card={card} raised={playable} dim={mine && !playable} />
            </Pressable>
          );
        })}
      </ScrollView>
      {choosing !== null && (
        <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setChoosing(null)}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={() => setChoosing(null)} />
          <View style={styles.wrap} pointerEvents="box-none">
            <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{tr.live.chooseSuit}</Text>
              <View style={styles.suits}>
                {SUITS.map((symbol, suit) => (
                  <Pressable
                    key={suit}
                    onPress={() => {
                      void play({ play: choosing, suit });
                      setChoosing(null);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.suitButton, { borderColor: t.border }, pressed && { backgroundColor: t.pressed }]}
                  >
                    <Text style={{ color: ink(suit), fontSize: 34 }}>{symbol}</Text>
                    <Text style={{ color: t.textSoft, fontSize: 12 }}>{tr.live.suits[suit]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 56,
    height: 80,
    borderRadius: 10,
    padding: 6,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#d6d3d1",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  back: { backgroundColor: "#b45309", borderColor: "#fff", borderWidth: 3, alignItems: "center", justifyContent: "center" },
  small: { width: 34, height: 48, borderRadius: 6, borderWidth: 2, padding: 2 },
  others: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  other: { alignItems: "center", gap: 4, padding: 8, borderRadius: 14, borderWidth: 2, minWidth: 84 },
  middle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  suit: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hand: { gap: 6, paddingTop: 14, paddingBottom: 6, paddingHorizontal: 4 },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  suits: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  suitButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
});
