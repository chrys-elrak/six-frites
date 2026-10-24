import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

export interface SheetAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  keepOpen?: boolean;
}

/** A bottom sheet of actions, like an iOS action sheet, that closes itself after a choice. */
export function Sheet({
  title,
  actions,
  onClose,
}: {
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View style={[styles.group, { backgroundColor: t.surface }]}>
          {title && (
            <View style={[styles.title, { borderColor: t.border }]}>
              <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }} numberOfLines={2}>
                {title}
              </Text>
            </View>
          )}
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
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.group, styles.action, { backgroundColor: pressed ? t.pressed : t.surface }]}
        >
          <Text style={[styles.label, { color: t.text, fontWeight: "600" }]}>Cancel</Text>
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
