import { SixApiError, unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { e2eeFor } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Card, Notice, PrimaryButton, SectionTitle, TextButton } from "./ui";

async function refreshMe() {
  useSession.getState().setUser(unwrap(await six.api.GET("/v1/me")));
}

/** Settings card for the recovery key that lets a new phone read past encrypted messages. */
export function EncryptionSettings() {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const local = useQuery({
    queryKey: ["recovery-key", user.id],
    queryFn: () => e2eeFor(user.id)!.hasRecoveryKey(),
  });
  const [dialog, setDialog] = useState<"create" | "restore" | null>(null);

  const onAccount = user.backupKeyId !== null;
  const onPhone = local.data === true;
  const status = onPhone
    ? tr.settings.keyOnPhone
    : onAccount
      ? tr.settings.keyOnAccountPhone
      : tr.settings.noKeyPhone;

  return (
    <View>
      <SectionTitle>{tr.settings.e2ee}</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          {onPhone ? <ShieldCheck size={22} color={brand} /> : <KeyRound size={22} color={t.muted} />}
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{status}</Text>
        </View>
        {onAccount && !onPhone ? (
          <PrimaryButton title={tr.settings.enterRecoveryKey} onPress={() => setDialog("restore")} />
        ) : (
          <PrimaryButton
            title={onPhone ? tr.settings.createNewRecoveryKey : tr.settings.createRecoveryKey}
            onPress={() => setDialog("create")}
          />
        )}
        {onAccount && !onPhone && (
          <TextButton title={tr.settings.lostKey} onPress={() => setDialog("create")} />
        )}
      </Card>
      {dialog === "create" && (
        <CreateKey
          replacing={onAccount}
          onClose={() => {
            setDialog(null);
            void local.refetch();
          }}
        />
      )}
      {dialog === "restore" && (
        <RestoreKey
          onClose={() => {
            setDialog(null);
            void local.refetch();
          }}
        />
      )}
    </View>
  );
}

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CreateKey({ replacing, onClose }: { replacing: boolean; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setWords((await e2eeFor(user.id)!.createRecoveryKey()).split(" "));
      await refreshMe();
    } catch {
      setError(tr.settings.couldNotCreateKey);
    } finally {
      setBusy(false);
    }
  }

  if (!words) {
    return (
      <Dialog title={tr.settings.createRecoveryKey} onClose={onClose}>
        <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
          {tr.settings.createIntroPhone}
          {replacing ? `\n\n${tr.settings.replaceWarningPhone}` : ""}
        </Text>
        {error && <Notice tone="error">{error}</Notice>}
        <PrimaryButton title={busy ? tr.settings.creating : tr.settings.showWords} disabled={busy} onPress={() => void create()} />
        <TextButton title={tr.settings.notNow} onPress={onClose} />
      </Dialog>
    );
  }

  return (
    <Dialog title={tr.settings.yourRecoveryKey} onClose={() => undefined}>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.words}>
        {words.map((w, i) => (
          <View key={i} style={[styles.word, { backgroundColor: t.field }]}>
            <Text style={{ color: t.muted, fontSize: 12, width: 20 }}>{i + 1}</Text>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{w}</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>
        {tr.settings.screenshotsBlocked}
      </Text>
      <PrimaryButton title={tr.settings.savedThem} onPress={onClose} />
    </Dialog>
  );
}

function RestoreKey({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      await e2eeFor(user.id)!.restoreRecoveryKey(words, user.backupKeyId);
      onClose();
    } catch (err) {
      setError(
        err instanceof SixApiError && err.code === "BACKUP_KEY_MISMATCH"
          ? tr.settings.restoreErrors.BACKUP_KEY_MISMATCH
          : tr.settings.restoreErrors.BAD_RECOVERY_KEY,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={tr.settings.enterYourRecoveryKey} onClose={onClose}>
      <TextInput
        value={words}
        onChangeText={setWords}
        placeholder={tr.settings.restorePlaceholder}
        placeholderTextColor={t.faint}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { backgroundColor: t.field, color: t.text }]}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <PrimaryButton title={busy ? tr.settings.checking : tr.settings.unlockMessages} disabled={busy || !words.trim()} onPress={() => void restore()} />
      <TextButton title={tr.common.cancel} onPress={onClose} />
    </Dialog>
  );
}

/** The 60-digit number two people compare in person to make sure nobody is in the middle. */
export function SafetyNumber({ userId }: { userId: string }) {
  const t = useTheme();
  const tr = useT();
  const meId = useSession((s) => s.user!.id);
  const number = useQuery({
    queryKey: ["safety-number", userId],
    queryFn: () => e2eeFor(meId)!.safetyNumber(userId),
  });
  if (number.isError) return null;
  if (!number.data) {
    return <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>{tr.settings.calculatingSafetyNumber}</Text>;
  }
  const groups = number.data.split(" ");
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{tr.settings.safetyNumber}</Text>
      <View style={styles.groups}>
        {groups.map((g, i) => (
          <Text key={i} style={[styles.group, { color: t.text }]}>
            {g}
          </Text>
        ))}
      </View>
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>
        {tr.settings.safetyNumberHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, padding: 16, gap: 14 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  words: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  word: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, width: "30%" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, minHeight: 110, textAlignVertical: "top" },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  group: { fontFamily: "monospace", fontSize: 17, letterSpacing: 1, width: "28%", textAlign: "center" },
});
