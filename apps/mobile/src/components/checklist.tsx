import { CHECKLIST, type Checklist, type ChecklistMark } from "@six/shared";
import { Square, SquareCheckBig, X } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { IconButton, PrimaryButton, TextButton } from "./ui";

export function ChecklistView({
  list,
  checks,
  mine,
  nameOf,
  onCheck,
}: {
  list: Checklist;
  checks: ChecklistMark[];
  mine: boolean;
  nameOf: (userId: string) => string;
  onCheck?: (item: number) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const marks = new Map(checks.map((c) => [c.item, c]));
  const done = list.items.filter((_, i) => marks.has(i)).length;
  return (
    <View style={styles.list}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: "700" }}>{list.title}</Text>
      <Text style={{ color: fg, fontSize: 13, opacity: 0.7, marginBottom: 2 }}>
        {tr.messages.tasksDone(done, list.items.length)}
      </Text>
      {list.items.map((item, i) => {
        const mark = marks.get(i);
        return (
          <Pressable
            key={i}
            disabled={!onCheck}
            onPress={() => onCheck?.(i)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!mark }}
            accessibilityHint={mark ? tr.messages.doneBy(nameOf(mark.userId)) : undefined}
            style={styles.item}
          >
            {mark ? <SquareCheckBig size={20} color={fg} /> : <Square size={20} color={fg} style={{ opacity: 0.6 }} />}
            <Text style={[{ flex: 1, color: fg, fontSize: 15 }, mark && styles.done]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NewChecklist({ onClose, onSend }: { onClose: () => void; onSend: (list: Checklist) => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState(["", ""]);
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const tasks = items.map((i) => i.trim()).filter(Boolean);
  const ready = !!title.trim() && tasks.length > 0;

  function add() {
    if (items.length >= CHECKLIST.items) return;
    setItems([...items, ""]);
    setTimeout(() => inputs.current[items.length]?.focus(), 50);
  }

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{tr.composer.newChecklist}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={CHECKLIST.title}
              placeholder={tr.composer.checklistTitlePlaceholder}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.composer.checklistTitle}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => inputs.current[0]?.focus()}
              submitBehavior="submit"
              style={[styles.field, { backgroundColor: t.field, color: t.text, fontWeight: "600" }]}
            />
            {items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <Square size={18} color={t.muted} />
                <TextInput
                  ref={(r) => {
                    inputs.current[i] = r;
                  }}
                  value={item}
                  onChangeText={(v) => setItems(items.map((x, j) => (j === i ? v : x)))}
                  onSubmitEditing={() => (i === items.length - 1 ? item.trim() && add() : inputs.current[i + 1]?.focus())}
                  submitBehavior="submit"
                  returnKeyType="next"
                  maxLength={CHECKLIST.item}
                  placeholder={tr.composer.task(i + 1)}
                  placeholderTextColor={t.muted}
                  accessibilityLabel={tr.composer.task(i + 1)}
                  style={[styles.field, { flex: 1, backgroundColor: t.field, color: t.text }]}
                />
                {items.length > 1 && (
                  <IconButton
                    Icon={X}
                    size={16}
                    label={tr.composer.removeTask}
                    onPress={() => setItems(items.filter((_, j) => j !== i))}
                  />
                )}
              </View>
            ))}
            {items.length < CHECKLIST.items && (
              <View style={{ alignSelf: "flex-start" }}>
                <TextButton title={`+ ${tr.composer.addTask}`} onPress={add} />
              </View>
            )}
          </ScrollView>
          <PrimaryButton
            title={tr.composer.sendChecklist}
            disabled={!ready}
            onPress={() => {
              onSend({ title: title.trim(), items: tasks });
              onClose();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { width: 256, maxWidth: "100%", paddingVertical: 4 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5 },
  done: { textDecorationLine: "line-through", opacity: 0.7 },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  field: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
