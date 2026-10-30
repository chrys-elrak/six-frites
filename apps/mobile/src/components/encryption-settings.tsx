import { SixApiError, unwrap } from "@six/sdk";
import type { Dict } from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { e2eeFor, retryUndecryptable } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Card, CodeInput, Notice, PrimaryButton, SectionTitle, TextButton } from "./ui";

async function refreshMe() {
  useSession.getState().setUser(unwrap(await six.api.GET("/v1/me")));
}

function useHasRecoveryKey() {
  const user = useSession((s) => s.user);
  return useQuery({
    queryKey: ["recovery-key", user?.id, user?.backupKeyId],
    queryFn: () => e2eeFor(user!.id)!.hasRecoveryKey(user!.backupKeyId),
    enabled: !!user,
  });
}

/** Settings card for the PIN that lets a new phone read past encrypted messages. */
export function EncryptionSettings() {
  const t = useTheme();
  const tr = useT();
  const bp = tr.settings.backupPin;
  const user = useSession((s) => s.user)!;
  const local = useHasRecoveryKey();
  const [dialog, setDialog] = useState<"pin" | "restore" | "words" | null>(null);

  const onPhone = local.data === true;
  const legacy = user.backupKeyId !== null && !user.hasBackupPin;
  const status = onPhone
    ? user.hasBackupPin
      ? bp.on
      : bp.noPin
    : user.hasBackupPin
      ? bp.locked
      : legacy
        ? tr.settings.keyOnAccountPhone
        : bp.noPin;
  const close = () => {
    setDialog(null);
    void local.refetch();
  };

  return (
    <View>
      <SectionTitle>{tr.settings.e2ee}</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          {onPhone ? <ShieldCheck size={22} color={brand} /> : <KeyRound size={22} color={t.muted} />}
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{status}</Text>
        </View>
        {onPhone ? (
          <PrimaryButton title={user.hasBackupPin ? bp.change : bp.create} onPress={() => setDialog("pin")} />
        ) : user.hasBackupPin ? (
          <>
            <PrimaryButton title={bp.enter} onPress={() => setDialog("restore")} />
            <TextButton title={bp.forgot} onPress={() => setDialog("pin")} />
          </>
        ) : legacy ? (
          <>
            <PrimaryButton title={tr.settings.enterRecoveryKey} onPress={() => setDialog("words")} />
            <TextButton title={tr.settings.lostKey} onPress={() => setDialog("pin")} />
          </>
        ) : (
          <PrimaryButton title={bp.create} onPress={() => setDialog("pin")} />
        )}
      </Card>
      {(dialog === "pin" || dialog === "restore") && <PinDialog restoring={dialog === "restore"} onClose={close} />}
      {dialog === "words" && <RestoreKey onClose={close} />}
    </View>
  );
}

/**
 * Shows the PIN dialog once per launch when this phone can't read past messages but a PIN would
 * fix it, or when there is no backup yet. Never offers a new PIN on a phone without the key while
 * the account has one, since that would start over and lose the old backup.
 */
export function BackupPinPrompt() {
  const user = useSession((s) => s.user);
  const local = useHasRecoveryKey();
  const [dismissed, setDismissed] = useState(false);
  if (!user || dismissed || local.data === undefined) return null;
  const restoring = !local.data && user.hasBackupPin;
  const creating = !user.hasBackupPin && (local.data || !user.backupKeyId);
  if (!restoring && !creating) return null;
  return <PinDialog restoring={restoring} prompted onClose={() => setDismissed(true)} />;
}

function pinError(err: unknown, tr: Dict) {
  if (!(err instanceof SixApiError)) return tr.common.somethingWrongRetry;
  if (err.code === "WRONG_BACKUP_PIN") return tr.settings.backupPin.wrong((err.details as { triesLeft: number }).triesLeft);
  if (err.code === "BACKUP_PIN_NOT_SET") return tr.settings.backupPin.notSet;
  return tr.settings.appLock.errors[err.code] ?? tr.common.somethingWrongRetry;
}

/** Asks for the backup PIN to restore past messages, or for a new PIN to protect them. */
function PinDialog({ restoring: initial, prompted, onClose }: { restoring: boolean; prompted?: boolean; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const bp = tr.settings.backupPin;
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const onPhone = useHasRecoveryKey().data === true;
  const [restoring, setRestoring] = useState(initial);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = pin.length === 6 && (restoring || again === pin);
  const mismatch = !restoring && again.length === 6 && again !== pin;
  const title = restoring ? bp.restoreTitle : onPhone && user.hasBackupPin ? bp.changeTitle : bp.createTitle;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const e = e2eeFor(user.id)!;
    try {
      if (restoring) await e.unlockWithPin(pin);
      else setUser(await e.setBackupPin(pin));
      void qc.invalidateQueries({ queryKey: ["recovery-key"] });
      retryUndecryptable();
      onClose();
    } catch (err) {
      setPin("");
      setError(pinError(err, tr));
      const gone =
        err instanceof SixApiError &&
        (err.code === "BACKUP_PIN_NOT_SET" || (err.details as { triesLeft?: number } | undefined)?.triesLeft === 0);
      if (gone) {
        setRestoring(false);
        await refreshMe().catch(() => null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{restoring ? bp.restoreHint : bp.createHint}</Text>
      {!restoring && !onPhone && user.backupKeyId && <Notice tone="error">{bp.newBackupWarning}</Notice>}
      <CodeInput
        key={String(restoring)}
        label={bp.pin}
        value={pin}
        onChange={(v) => setPin(v.slice(0, 6))}
        autoFocus
        onSubmit={restoring ? () => void save() : undefined}
      />
      {!restoring && (
        <CodeInput label={bp.again} value={again} onChange={(v) => setAgain(v.slice(0, 6))} onSubmit={() => void save()} />
      )}
      {(error || mismatch) && <Notice tone="error">{error ?? bp.mismatch}</Notice>}
      <PrimaryButton
        title={restoring ? bp.restore : tr.common.save}
        busy={busy}
        disabled={!ready || busy}
        onPress={() => void save()}
      />
      {restoring && (
        <TextButton
          title={bp.forgot}
          onPress={() => {
            setRestoring(false);
            setPin("");
            setError(null);
          }}
        />
      )}
      <TextButton title={prompted ? bp.later : tr.common.cancel} onPress={onClose} />
    </Dialog>
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
      retryUndecryptable();
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

/** The 12 emoji two people compare in person to make sure nobody is in the middle. */
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
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, minHeight: 110, textAlignVertical: "top" },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  group: { fontSize: 30, width: "21%", textAlign: "center" },
});
