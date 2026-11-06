import { AUTO_DELETE, AUTO_DELETE_UNITS, durationLabel } from "@six/shared";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View, ScrollView } from "react-native";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { PrimaryButton, TextButton } from "./ui";

type Units = readonly (readonly [(typeof AUTO_DELETE_UNITS)[number][0], number])[];

function initial(secs: number, units: Units) {
  const [, size] = [...units].reverse().find(([, size]) => secs % size === 0) ?? units[0]!;
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
  const tr = useT();
  return (
    <DurationPicker
      value={current ?? 2 * 86400}
      units={AUTO_DELETE_UNITS}
      range={AUTO_DELETE}
      title={tr.chat.customAutoDelete}
      hint={(label) => tr.chat.autoDeleteHint(peerName, label)}
      rangeHint={tr.chat.autoDeleteRange}
      submit={tr.chat.setTimer}
      onSet={onSet}
      onClose={onClose}
    />
  );
}

/** Asks for an amount of `units` that adds up to between `range.min` and `range.max` seconds. */
export function DurationPicker({
  value,
  units,
  range,
  title,
  hint,
  rangeHint,
  submit,
  onSet,
  onClose,
}: {
  value: number;
  units: Units;
  range: { min: number; max: number };
  title: string;
  hint: (label: string) => string;
  rangeHint: string;
  submit: string;
  onSet: (secs: number) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const start = initial(value, units);
  const [amount, setAmount] = useState(start.amount);
  const [unit, setUnit] = useState<number>(start.unit);

  const n = /^\d+$/.test(amount) ? Number(amount) : 0;
  const secs = n * unit;
  const valid = n >= 1 && secs >= range.min && secs <= range.max;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              autoFocus
              maxLength={4}
              accessibilityLabel={tr.chat.amount}
              style={[styles.input, { backgroundColor: t.field, color: t.text }]}
            />
            <View style={styles.units}>
              {units.map(([label, size]) => (
                <Pressable
                  key={label}
                  onPress={() => setUnit(size)}
                  accessibilityState={{ selected: unit === size }}
                  style={[styles.unit, { backgroundColor: unit === size ? brand : t.field }]}
                >
                  <Text style={{ color: unit === size ? brandInk : t.text, fontWeight: "600", fontSize: 14 }}>
                    {tr.chat.units[label]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: valid ? t.muted : t.danger, fontSize: 13, textAlign: "center" }}>
              {valid ? hint(durationLabel(secs, tr)) : rangeHint}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <TextButton title={tr.common.cancel} onPress={onClose} />
              </View>
              <PrimaryButton
                title={submit}
                disabled={!valid}
                style={{ flex: 1 }}
                onPress={() => {
                  onSet(secs);
                  onClose();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, padding: 16, maxHeight: "92%" },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, textAlign: "center" },
  units: { flexDirection: "row", gap: 6 },
  unit: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
});
