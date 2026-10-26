import { unwrap } from "@six/sdk";
import { Lock } from "lucide-react-native";
import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { unlock } from "@/lib/app-lock";
import { useT } from "@/lib/i18n";
import { logout, useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Dialog } from "./encryption-settings";
import { Logo } from "./logo";
import { CodeInput, codeError } from "./privacy-code";
import { Card, Notice, PrimaryButton, SectionTitle, TextButton } from "./ui";

export function AppLockSettings() {
  const t = useTheme();
  const tr = useT();
  const hasLock = useSession((s) => s.user!.hasAppLock);
  const setUser = useSession((s) => s.setUser);
  const [setting, setSetting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setFailed(false);
    try {
      setUser(unwrap(await six.api.DELETE("/v1/me/app-lock")));
    } catch {
      setFailed(true);
    }
  }

  return (
    <View>
      <SectionTitle>{tr.settings.appLock.title}</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <Lock size={22} color={hasLock ? brand : t.muted} />
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
            {hasLock ? tr.settings.appLock.onHint : tr.settings.appLock.offHint}
          </Text>
        </View>
        {failed && <Notice tone="error">{tr.common.somethingWrongRetry}</Notice>}
        <PrimaryButton
          title={hasLock ? tr.settings.appLock.change : tr.settings.appLock.set}
          onPress={() => setSetting(true)}
        />
        {hasLock && <TextButton title={tr.common.remove} onPress={() => void remove()} />}
      </Card>
      {setting && <SetCodeDialog hasLock={hasLock} onClose={() => setSetting(false)} />}
    </View>
  );
}

function SetCodeDialog({ hasLock, onClose }: { hasLock: boolean; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const setUser = useSession((s) => s.setUser);
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = again.length >= code.length && again.length > 0 && again !== code;
  const ready = code.length >= 4 && again === code;

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = unwrap(await six.api.PUT("/v1/me/app-lock", { body: { code } }));
      unlock();
      setUser(user);
      onClose();
    } catch (err) {
      setError(codeError(err, tr, tr.settings.appLock.errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={hasLock ? tr.settings.appLock.changeTitle : tr.settings.appLock.setTitle} onClose={onClose}>
      <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{tr.settings.appLock.hint}</Text>
      <CodeInput label={tr.contacts.privacy.new} value={code} onChange={setCode} autoFocus />
      <CodeInput label={tr.contacts.privacy.again} value={again} onChange={setAgain} onSubmit={() => void save()} />
      {(error || mismatch) && <Notice tone="error">{error ?? tr.contacts.privacy.mismatch}</Notice>}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextButton title={tr.common.cancel} onPress={onClose} />
        </View>
        <PrimaryButton
          title={tr.common.save}
          busy={busy}
          disabled={!ready || busy}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </Dialog>
  );
}

/**
 * Covers the app until the app lock code is entered. A modal, so it also sits above any dialog left open.
 * Forgetting the code means signing out and in again.
 */
export function LockScreen() {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (code.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await six.api.POST("/v1/me/app-lock/unlock", { body: { code } }));
      unlock();
    } catch (err) {
      setCode("");
      setError(codeError(err, tr, tr.settings.appLock.errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.lock, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}
      >
        <View style={styles.body}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Logo size={56} />
            <Text style={[styles.title, { color: t.text }]}>{tr.settings.appLock.locked}</Text>
          </View>
          <CodeInput
            label={tr.settings.appLock.enterCode}
            value={code}
            onChange={setCode}
            autoFocus
            onSubmit={() => void check()}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton
            title={tr.settings.appLock.unlock}
            busy={busy}
            disabled={code.length < 4 || busy}
            onPress={() => void check()}
          />
          <TextButton title={tr.settings.appLock.forgot} onPress={() => void logout()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lock: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  body: { width: "100%", maxWidth: 360, alignSelf: "center", gap: 14 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
});
