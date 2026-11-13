import { POLL, type Poll } from "@six/shared";
import { Check, X } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Modal } from "./modal";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { IconButton, PrimaryButton, TextButton, Toggle } from "./ui";

/** A poll in a bubble: each option with its share of the votes, and who chose it when the poll shows that. */
export function PollView({
  poll,
  votes,
  myVote,
  visible,
  voters,
  nameOf,
  mine,
  onVote,
}: {
  poll: Poll;
  votes: number[];
  myVote: number | null;
  visible: boolean;
  voters: { option: number; userId: string }[];
  nameOf: (userId: string) => string;
  mine: boolean;
  onVote?: (option: number) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const total = poll.options.reduce((n, _, i) => n + (votes[i] ?? 0), 0);
  return (
    <View style={styles.poll}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: "700" }}>{poll.question}</Text>
      <Text style={{ color: fg, fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
        {visible ? tr.messages.publicPoll : tr.messages.anonymousPoll} · {tr.messages.votes(total)}
      </Text>
      {poll.options.map((option, i) => {
        const count = votes[i] ?? 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        const chosen = myVote === i;
        const names = visible ? voters.filter((v) => v.option === i).map((v) => nameOf(v.userId)) : [];
        return (
          <View key={i}>
            <Pressable
              disabled={!onVote}
              onPress={() => onVote?.(i)}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              style={[styles.option, { borderColor: fg }]}
            >
              <View style={[styles.bar, { width: `${share}%`, backgroundColor: fg }]} />
              <View style={[styles.mark, { borderColor: fg }]}>{chosen && <Check size={13} strokeWidth={3} color={fg} />}</View>
              <Text style={{ flex: 1, color: fg, fontSize: 15 }}>{option}</Text>
              {total > 0 && <Text style={{ color: fg, fontSize: 13, fontWeight: "700", opacity: 0.8 }}>{share}%</Text>}
            </Pressable>
            {names.length > 0 && (
              <Text numberOfLines={1} style={{ color: fg, fontSize: 12, opacity: 0.7, paddingHorizontal: 10, marginTop: 2 }}>
                {names.join(", ")}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function NewPoll({ onClose, onSend }: { onClose: () => void; onSend: (poll: Poll, visible: boolean) => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [visible, setVisible] = useState(false);
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = !!question.trim() && filled.length >= 2;

  function add() {
    if (options.length >= POLL.options) return;
    setOptions([...options, ""]);
    setTimeout(() => inputs.current[options.length]?.focus(), 50);
  }

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{tr.composer.newPoll}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              maxLength={POLL.question}
              placeholder={tr.composer.pollQuestionPlaceholder}
              placeholderTextColor={t.muted}
              accessibilityLabel={tr.composer.pollQuestion}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => inputs.current[0]?.focus()}
              submitBehavior="submit"
              style={[styles.field, { backgroundColor: t.field, color: t.text, fontWeight: "600" }]}
            />
            {options.map((option, i) => (
              <View key={i} style={styles.row}>
                <TextInput
                  ref={(r) => {
                    inputs.current[i] = r;
                  }}
                  value={option}
                  onChangeText={(v) => setOptions(options.map((x, j) => (j === i ? v : x)))}
                  onSubmitEditing={() => (i === options.length - 1 ? option.trim() && add() : inputs.current[i + 1]?.focus())}
                  submitBehavior="submit"
                  returnKeyType="next"
                  maxLength={POLL.option}
                  placeholder={tr.composer.pollOption(i + 1)}
                  placeholderTextColor={t.muted}
                  accessibilityLabel={tr.composer.pollOption(i + 1)}
                  style={[styles.field, { flex: 1, backgroundColor: t.field, color: t.text }]}
                />
                {options.length > 2 && (
                  <IconButton Icon={X} size={16} label={tr.composer.removeOption} onPress={() => setOptions(options.filter((_, j) => j !== i))} />
                )}
              </View>
            ))}
            {options.length < POLL.options && (
              <View style={{ alignSelf: "flex-start" }}>
                <TextButton title={`+ ${tr.composer.addOption}`} onPress={add} />
              </View>
            )}
            <Toggle
              label={tr.composer.pollShowVoters}
              hint={visible ? tr.composer.pollVisibleHint : tr.composer.pollAnonymous}
              value={visible}
              onChange={setVisible}
            />
          </ScrollView>
          <PrimaryButton
            title={tr.composer.sendPoll}
            disabled={!ready}
            onPress={() => {
              onSend({ question: question.trim(), options: filled }, visible);
              onClose();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  poll: { width: 256, maxWidth: "100%", paddingVertical: 4, gap: 6 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.15 },
  mark: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", opacity: 0.8 },
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  field: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
