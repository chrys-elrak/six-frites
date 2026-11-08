import { AUTO_DELETE_UNITS, COMMENT_RULE_RANGE, COMMENT_RULES, type CommentRule, commentRuleLabel } from "@six/shared";
import { MessageSquareOff } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";
import { PrimaryButton, TextButton } from "./ui";

const UNITS = AUTO_DELETE_UNITS.filter(([u]) => u !== "months");

/** For a group admin: posts the next message with its comments closed, or closing after some comments or some time. */
export function CommentsPicker({ value, onChange }: { value: CommentRule | null; onChange: (value: CommentRule | null) => void }) {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={value ? commentRuleLabel(value, tr) : tr.groups.commentsRule}
        style={styles.button}
      >
        <MessageSquareOff size={22} color={value ? brand : t.faint} />
      </Pressable>
      {open && (
        <CommentRuleMenu
          value={value}
          clearLabel={value ? tr.groups.commentsOpen : null}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The choices for a group message's comments: closed, the presets, a custom limit or delay, and `clearLabel` to drop the rule. */
export function CommentRuleMenu({
  value,
  clearLabel,
  onPick,
  onClose,
}: {
  value: CommentRule | null;
  clearLabel: string | null;
  onPick: (rule: CommentRule | null) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [custom, setCustom] = useState(false);
  if (custom) return <CustomRule value={value} onSave={onPick} onClose={onClose} />;
  return (
    <Sheet
      title={value ? commentRuleLabel(value, tr) : tr.groups.commentsRule}
      onClose={onClose}
      actions={[
        ...COMMENT_RULES.filter((r) => !(value?.commentsClosed && r.commentsClosed)).map((r) => ({
          label: commentRuleLabel(r, tr),
          onSelect: () => onPick(r),
        })),
        { label: tr.groups.customRule, keepOpen: true, onSelect: () => setCustom(true) },
        ...(clearLabel ? [{ label: clearLabel, onSelect: () => onPick(null) }] : []),
      ]}
    />
  );
}

function CustomRule({ value, onSave, onClose }: { value: CommentRule | null; onSave: (r: CommentRule) => void; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(value?.commentsLimit ? String(value.commentsLimit) : "");
  const start = [...UNITS].reverse().find(([, size]) => value?.commentsCloseIn && value.commentsCloseIn % size === 0) ?? UNITS[0]!;
  const [amount, setAmount] = useState(value?.commentsCloseIn ? String(value.commentsCloseIn / start[1]) : "");
  const [unit, setUnit] = useState<number>(start[1]);

  const limit = count ? Number(count) : undefined;
  const delay = amount ? Number(amount) * unit : undefined;
  const { count: c, delay: d } = COMMENT_RULE_RANGE;
  const valid =
    (limit !== undefined || delay !== undefined) &&
    (limit === undefined || (limit >= c.min && limit <= c.max)) &&
    (delay === undefined || (delay >= d.min && delay <= d.max));
  const rule: CommentRule = { commentsLimit: limit, commentsCloseIn: delay };
  const input = [styles.input, { backgroundColor: t.field, color: t.text }];

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.title, { color: t.text }]}>{tr.groups.customRuleTitle}</Text>
            <Text style={{ color: t.textSoft, fontSize: 14 }}>{tr.groups.customRuleCount}</Text>
            <TextInput
              value={count}
              onChangeText={(v) => setCount(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              autoFocus
              maxLength={4}
              placeholder="10"
              placeholderTextColor={t.faint}
              style={input}
            />
            <Text style={{ color: t.textSoft, fontSize: 14 }}>{tr.groups.customRuleDelay}</Text>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="2"
              placeholderTextColor={t.faint}
              accessibilityLabel={tr.chat.amount}
              style={input}
            />
            <View style={styles.units}>
              {UNITS.map(([u, size]) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(size)}
                  accessibilityState={{ selected: unit === size }}
                  style={[styles.unit, { backgroundColor: unit === size ? brand : t.field }]}
                >
                  <Text style={{ color: unit === size ? brandInk : t.text, fontWeight: "600", fontSize: 14 }}>{tr.chat.units[u]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: valid || (!count && !amount) ? t.muted : t.danger, fontSize: 13, textAlign: "center" }}>
              {valid ? commentRuleLabel(rule, tr) : count || amount ? tr.groups.customRuleRange : tr.groups.customRuleHint}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <TextButton title={tr.common.cancel} onPress={onClose} />
              </View>
              <PrimaryButton
                title={tr.common.done}
                disabled={!valid}
                style={{ flex: 1 }}
                onPress={() => {
                  onSave(rule);
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
  button: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, padding: 16, maxHeight: "92%" },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, textAlign: "center" },
  units: { flexDirection: "row", gap: 6 },
  unit: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
});
