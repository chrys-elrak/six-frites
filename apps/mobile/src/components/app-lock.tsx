import { unwrap } from "@six/sdk";
import { Fingerprint, Lock } from "lucide-react-native";
import { useEffect, useEffectEvent, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Modal } from "./modal";
import { Text } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  canUseBiometrics,
  checkBiometrics,
  setBiometricUnlock,
  setCodeLength,
  unlock,
  useBiometricUnlock,
  useCodeLength,
} from "@/lib/app-lock";
import { useT } from "@/lib/i18n";
import { logout, useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { e2eeFor } from "@/lib/e2ee";
import { Dialog, useHasRecoveryKey } from "./encryption-settings";
import { Logo } from "./logo";
import { Card, CodeInput, IconButton, Notice, PrimaryButton, SectionTitle, TextButton, Toggle, codeError } from "./ui";

export function AppLockSettings() {
  const t = useTheme();
  const tr = useT();
  const hasLock = useSession((s) => s.user!.hasAppLock);
  const setUser = useSession((s) => s.setUser);
  const [turningOn, setTurningOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const biometric = useBiometricUnlock((s) => s.on);
  const [canBiometric, setCanBiometric] = useState(false);

  useEffect(() => {
    void canUseBiometrics().then(setCanBiometric);
  }, []);

  async function turnOff() {
    setFailed(false);
    try {
      setUser(unwrap(await six.api.DELETE("/v1/me/app-lock")));
      setBiometricUnlock(false);
    } catch {
      setFailed(true);
    }
  }

  async function toggleBiometric(on: boolean) {
    if (on && !(await checkBiometrics(tr.settings.appLock.fingerprintPrompt, tr.common.cancel))) return;
    setBiometricUnlock(on);
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
          title={hasLock ? tr.settings.appLock.turnOff : tr.settings.appLock.turnOn}
          onPress={() => (hasLock ? void turnOff() : setTurningOn(true))}
        />
      </Card>
      {hasLock && (
        <Card style={{ marginTop: 8 }}>
          <Toggle
            label={tr.settings.appLock.biometric}
            hint={canBiometric ? tr.settings.appLock.biometricHint : tr.settings.appLock.noBiometric}
            value={biometric && canBiometric}
            disabled={!canBiometric}
            onChange={(on) => void toggleBiometric(on)}
          />
        </Card>
      )}
      {turningOn && <TurnOnDialog onClose={() => setTurningOn(false)} />}
    </View>
  );
}

/**
 * Turns the lock on with the backup PIN, so one code does both. Without a PIN yet, the new code becomes it, unless
 * this phone can't make one without dropping an older backup: then the lock gets a code of its own.
 */
function TurnOnDialog({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const hasKey = useHasRecoveryKey().data === true;
  const usePin = user.hasBackupPin;
  const makePin = !usePin && (hasKey || !user.backupKeyId);
  const max = makePin ? 6 : 8;
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = !usePin && again.length >= code.length && again.length > 0 && again !== code;
  const ready = code.length >= (makePin ? 6 : 4) && (usePin || again === code);

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (makePin) await e2eeFor(user.id)!.setBackupPin(code);
      const updated = unwrap(await six.api.PUT("/v1/me/app-lock", { body: { code } }));
      setCodeLength(code.length);
      unlock();
      setUser(updated);
      onClose();
    } catch (err) {
      setError(codeError(err, tr, tr.settings.appLock.errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={tr.settings.appLock.turnOnTitle} onClose={onClose}>
      <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
        {usePin ? tr.settings.appLock.usePin : makePin ? tr.settings.appLock.newPin : tr.settings.appLock.newCode}
      </Text>
      <CodeInput
        label={usePin ? tr.settings.backupPin.pin : tr.settings.appLock.code}
        value={code}
        onChange={(v) => setCode(v.slice(0, max))}
        autoFocus
        onSubmit={usePin ? () => void save() : undefined}
      />
      {!usePin && (
        <CodeInput label={tr.settings.appLock.again} value={again} onChange={(v) => setAgain(v.slice(0, max))} onSubmit={() => void save()} />
      )}
      {(error || mismatch) && <Notice tone="error">{error ?? tr.settings.appLock.mismatch}</Notice>}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextButton title={tr.common.cancel} onPress={onClose} />
        </View>
        <PrimaryButton
          title={tr.settings.appLock.turnOn}
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
 * Forgetting the code means signing out and in again. With `onCancel` it guards a single screen, like the
 * archived chats, and can be backed out of instead. With `check` the code goes there instead of the plain
 * unlock, for actions that need the code itself, like a private label; the fingerprint can't stand in then.
 */
export function LockScreen({
  title,
  onUnlock = unlock,
  onCancel,
  check: verify,
}: {
  title?: string;
  onUnlock?: () => void;
  onCancel?: () => void;
  check?: (code: string) => Promise<unknown>;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const length = useCodeLength((s) => s.length);
  const biometric = useBiometricUnlock((s) => s.on) && !verify;
  const hasKey = useHasRecoveryKey().data === true;

  function askFingerprint() {
    void checkBiometrics(tr.settings.appLock.fingerprintPrompt, tr.settings.appLock.useCode).then((ok) => ok && onUnlock());
  }

  const askOnOpen = useEffectEvent(askFingerprint);
  useEffect(() => {
    if (biometric) askOnOpen();
  }, [biometric]);

  async function check(value = code) {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (verify) await verify(value);
      else unwrap(await six.api.POST("/v1/me/app-lock/unlock", { body: { code: value } }));
      setCodeLength(value.length);
      onUnlock();
      const { user, setUser } = useSession.getState();
      if (!verify && hasKey && user?.hasAppLock && !user.appLockIsPin) {
        void e2eeFor(user.id)?.setBackupPin(value).then(setUser).catch(() => null);
      }
    } catch (err) {
      setCode("");
      setAuto(false);
      setError(codeError(err, tr, tr.settings.appLock.errors));
    } finally {
      setBusy(false);
    }
  }

  function type(value: string) {
    setCode(value);
    if (auto && value.length === length) void check(value);
  }

  return (
    <Modal statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel ?? (() => {})}>
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.lock, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}
      >
        <View style={styles.body}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Logo size={56} />
            <Text style={[styles.title, { color: t.text }]}>{title ?? tr.settings.appLock.locked}</Text>
          </View>
          <CodeInput
            label={tr.settings.appLock.enterCode}
            value={code}
            onChange={type}
            autoFocus={!biometric}
            onSubmit={() => void check()}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton
            title={tr.settings.appLock.unlock}
            busy={busy}
            disabled={code.length < 4 || busy}
            onPress={() => void check()}
          />
          {biometric && (
            <IconButton
              Icon={Fingerprint}
              label={tr.settings.appLock.useFingerprint}
              onPress={askFingerprint}
              size={40}
              color={brand}
              style={{ alignSelf: "center" }}
            />
          )}
          {onCancel ? (
            <TextButton title={tr.common.cancel} onPress={onCancel} />
          ) : (
            <TextButton title={tr.settings.appLock.forgot} onPress={() => void logout()} />
          )}
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
