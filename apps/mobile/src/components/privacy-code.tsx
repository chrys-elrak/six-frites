import { SixApiError, unwrap } from "@six/sdk";
import type { Dict } from "@six/shared";
import { EyeOff } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Dialog } from "./encryption-settings";
import { Card, Notice, PrimaryButton, SectionTitle, TextButton } from "./ui";

export function codeError(err: unknown, tr: Dict) {
  const code = err instanceof SixApiError ? err.code : undefined;
  const errors: Record<string, string | undefined> = tr.contacts.privacy.errors;
  return (code && errors[code]) ?? tr.common.somethingWrongRetry;
}

export function CodeInput({
  value,
  onChange,
  label,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSoft, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 8))}
        secureTextEntry
        keyboardType="number-pad"
        autoComplete="off"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        maxLength={8}
        style={[styles.input, { backgroundColor: t.field, color: t.text }]}
      />
    </View>
  );
}

export function PrivacyCodeSettings() {
  const t = useTheme();
  const tr = useT();
  const hasCode = useSession((s) => s.user!.hasContactPin);
  const [dialog, setDialog] = useState<"set" | "remove" | null>(null);

  return (
    <View>
      <SectionTitle>{tr.contacts.privacy.title}</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <EyeOff size={22} color={hasCode ? brand : t.muted} />
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
            {hasCode ? tr.contacts.privacy.onHint : tr.contacts.privacy.offHint}
          </Text>
        </View>
        <PrimaryButton title={hasCode ? tr.contacts.privacy.change : tr.contacts.privacy.set} onPress={() => setDialog("set")} />
        {hasCode && <TextButton title={tr.contacts.privacy.remove} onPress={() => setDialog("remove")} />}
      </Card>
      {dialog && <CodeDialog removing={dialog === "remove"} hasCode={hasCode} onClose={() => setDialog(null)} />}
    </View>
  );
}

function CodeDialog({ removing, hasCode, onClose }: { removing: boolean; hasCode: boolean; onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const setUser = useSession((s) => s.setUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = !removing && again.length >= next.length && again.length > 0 && again !== next;
  const ready = removing
    ? current.length >= 4
    : next.length >= 4 && again === next && (!hasCode || current.length >= 4);

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = removing
        ? unwrap(await six.api.DELETE("/v1/me/contact-pin", { body: { currentPin: current } }))
        : unwrap(await six.api.PUT("/v1/me/contact-pin", { body: { pin: next, ...(hasCode && { currentPin: current }) } }));
      setUser(user);
      onClose();
    } catch (err) {
      setError(codeError(err, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={
        removing
          ? tr.contacts.privacy.removeTitle
          : hasCode
            ? tr.contacts.privacy.changeTitle
            : tr.contacts.privacy.setTitle
      }
      onClose={onClose}
    >
      {!removing && (
        <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{tr.contacts.privacy.hint}</Text>
      )}
      {(removing || hasCode) && <CodeInput label={tr.contacts.privacy.current} value={current} onChange={setCurrent} autoFocus />}
      {!removing && (
        <>
          <CodeInput label={tr.contacts.privacy.new} value={next} onChange={setNext} autoFocus={!hasCode} />
          <CodeInput label={tr.contacts.privacy.again} value={again} onChange={setAgain} onSubmit={() => void save()} />
        </>
      )}
      {(error || mismatch) && <Notice tone="error">{error ?? tr.contacts.privacy.mismatch}</Notice>}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextButton title={tr.common.cancel} onPress={onClose} />
        </View>
        <PrimaryButton
          title={removing ? tr.common.remove : tr.common.save}
          busy={busy}
          disabled={!ready || busy}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, letterSpacing: 6 },
});
