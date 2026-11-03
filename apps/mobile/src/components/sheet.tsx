import type { LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export interface SheetAction {
  label: string;
  /** Shown in a message's long-press bar; sheets list labels only. */
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
}

/** A bottom sheet of actions, like an iOS action sheet, that closes itself after a choice. */
export function Sheet({
  title,
  header,
  floating,
  actions,
  onClose,
}: {
  title?: string;
  header?: React.ReactNode;
  floating?: (sheetTop: number) => React.ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [sheetTop, setSheetTop] = useState<number | null>(null);

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      {sheetTop !== null && floating?.(sheetTop)}
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View
          onLayout={(e) => setSheetTop(e.nativeEvent.layout.y)}
          style={[styles.group, { backgroundColor: t.surface }]}
        >
          {header && <View style={[styles.title, { borderColor: t.border }]}>{header}</View>}
          {title && (
            <View style={[styles.title, { borderColor: t.border }]}>
              <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }} numberOfLines={2}>
                {title}
              </Text>
            </View>
          )}
          <ScrollView style={{ maxHeight: height * 0.6 }} bounces={false}>
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
              <Text style={[styles.label, { color: a.destructive ? t.danger : t.text }]}>{a.label}</Text>
            </Pressable>
          ))}
          </ScrollView>
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.group, styles.action, { backgroundColor: pressed ? t.pressed : t.surface }]}
        >
          <Text style={[styles.label, { color: t.text, fontWeight: "600" }]}>{tr.common.cancel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12, gap: 8 },
  group: { borderRadius: 16, overflow: "hidden" },
  title: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  action: { paddingVertical: 15, paddingHorizontal: 16, alignItems: "center" },
  label: { fontSize: 17 },
});
