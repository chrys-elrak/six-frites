import { AUTO_DELETE, AUTO_DELETE_UNITS, durationLabel } from "@six/shared";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { PrimaryButton, TextButton } from "./ui";

function initial(secs: number | null) {
  if (!secs) return { amount: "2", unit: 86400 };
  const [, size] = [...AUTO_DELETE_UNITS].reverse().find(([, size]) => secs % size === 0) ?? ["hours", 3600];
  return { amount: String(secs / size), unit: size };
}

export function AutoDeleteCustom({
  current,
  peerName,
  onSet,
  onClose,
}: {
  current: number | null;
  peerName: string;
  onSet: (secs: number) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const start = initial(current);
  const [amount, setAmount] = useState(start.amount);
  const [unit, setUnit] = useState<number>(start.unit);

  const n = /^\d+$/.test(amount) ? Number(amount) : 0;
  const secs = n * unit;
  const valid = n >= 1 && secs >= AUTO_DELETE.min && secs <= AUTO_DELETE.max;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.title, { color: t.text }]}>Custom auto-delete</Text>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            accessibilityLabel="Amount"
            style={[styles.input, { backgroundColor: t.field, color: t.text }]}
          />
          <View style={styles.units}>
            {AUTO_DELETE_UNITS.map(([label, size]) => (
              <Pressable
                key={label}
                onPress={() => setUnit(size)}
                accessibilityState={{ selected: unit === size }}
                style={[styles.unit, { backgroundColor: unit === size ? brand : t.field }]}
              >
                <Text style={{ color: unit === size ? brandInk : t.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: valid ? t.muted : t.danger, fontSize: 13, textAlign: "center" }}>
            {valid
              ? `New messages will be deleted for you and ${peerName} ${durationLabel(secs)} after they're sent.`
              : "Pick between 1 hour and 1 year."}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <TextButton title="Cancel" onPress={onClose} />
            </View>
            <PrimaryButton
              title="Set timer"
              disabled={!valid}
              style={{ flex: 1 }}
              onPress={() => {
                onSet(secs);
                onClose();
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, padding: 16, gap: 14 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, textAlign: "center" },
  units: { flexDirection: "row", gap: 6 },
  unit: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
});
