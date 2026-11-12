import { placeReactionBar } from "@six/shared";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Modal } from "./modal";
import type { Anchor } from "./reactions";
import { ActionBar, type SheetAction } from "./sheet";

type Size = { width: number; height: number };

/**
 * A message's long-press menu, like Messenger on Android: the screen dims except for the message at `anchor`,
 * `children` (the reaction bar) sits right on top of it, and the actions line up as icons in a bar at the bottom.
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
  const [tools, setTools] = useState(0);
  const screen = { top: insets.top + 8, bottom: height - tools - 8, width };
  const spot = bar && tools ? placeReactionBar(anchor, bar, screen, mine) : null;
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
        <View
          onLayout={(e: LayoutChangeEvent) => setBar({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          style={[styles.bar, { backgroundColor: t.surface }, spot ?? styles.hidden]}
        >
          {children}
        </View>
      )}
      <ActionBar actions={actions} onClose={onClose} onHeight={setTools} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    borderRadius: 999,
    padding: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  hidden: { top: 0, left: 0, opacity: 0 },
});
