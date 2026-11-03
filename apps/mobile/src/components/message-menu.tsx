import { placeMessageMenu } from "@six/shared";
import { useState } from "react";
import { type LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import type { Anchor } from "./reactions";
import type { SheetAction } from "./sheet";
import { Text } from "./text";

type Size = { width: number; height: number };

/**
 * A message's long-press menu, Messenger style: the screen dims except for the message at `anchor`, `children` (the
 * reaction bar) sits right on top of it and the actions open in a card next to it.
 */
export function MessageMenu({
  anchor,
  mine,
  actions,
  onClose,
  children,
}: {
  anchor: Anchor;
  mine: boolean;
  actions: SheetAction[];
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [bar, setBar] = useState<Size | null>(null);
  const [card, setCard] = useState<Size | null>(null);
  const screen = { top: insets.top + 8, bottom: height - insets.bottom - 8, width };
  const spot = card && (!children || bar) ? placeMessageMenu(anchor, children ? bar : null, card, screen, mine) : null;
  const measure = (set: (s: Size) => void) => (e: LayoutChangeEvent) =>
    set({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const dim = { position: "absolute", backgroundColor: t.backdrop } as const;
  const end = anchor.y + anchor.height;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View style={[dim, { top: 0, left: 0, right: 0, height: Math.max(0, anchor.y) }]} />
        <View style={[dim, { top: end, left: 0, right: 0, bottom: 0 }]} />
        <View style={[dim, { top: anchor.y, height: anchor.height, left: 0, width: Math.max(0, anchor.x) }]} />
        <View style={[dim, { top: anchor.y, height: anchor.height, left: anchor.x + anchor.width, right: 0 }]} />
      </Pressable>
      {children && (
        <View onLayout={measure(setBar)} style={[styles.bar, { backgroundColor: t.surface }, spot?.bar ?? styles.hidden]}>
          {children}
        </View>
      )}
      <View
        onLayout={measure(setCard)}
        style={[
          styles.card,
          { backgroundColor: t.surface, maxHeight: screen.bottom - screen.top, maxWidth: width - 16 },
          spot?.card ?? styles.hidden,
        ]}
      >
        <ScrollView bounces={false}>
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              onPress={() => {
                if (!a.keepOpen) onClose();
                a.onSelect();
              }}
              style={({ pressed }) => [
                styles.action,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border },
                pressed && { backgroundColor: t.pressed },
              ]}
            >
              <Text style={{ fontSize: 16, color: a.destructive ? t.danger : t.text }}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const shadow = {
  elevation: 8,
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
};

const styles = StyleSheet.create({
  bar: { position: "absolute", borderRadius: 999, padding: 6, ...shadow },
  card: { position: "absolute", minWidth: 200, borderRadius: 14, overflow: "hidden", ...shadow },
  action: { paddingVertical: 12, paddingHorizontal: 16 },
  hidden: { top: 0, left: 0, opacity: 0 },
});
