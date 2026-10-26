import { SixApiError, unwrap } from "@six/sdk";
import { EyeOff } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Dialog } from "./encryption-settings";
import { Card, Notice, PrimaryButton, SectionTitle, TextButton } from "./ui";

const codeErrors: Record<string, string> = {
  WRONG_CONTACT_PIN: "That's not your privacy code.",
  CONTACT_PIN_REQUIRED: "Enter your privacy code.",
  CONTACT_PIN_NOT_SET: "Set a privacy code in Settings first.",
  RATE_LIMITED: "Too many tries. Wait a minute.",
  VALIDATION_FAILED: "Use 4 to 8 digits.",
};

export function codeError(err: unknown) {
  const code = err instanceof SixApiError ? err.code : undefined;
  return (code && codeErrors[code]) ?? "Something went wrong. Try again.";
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
  const hasCode = useSession((s) => s.user!.hasContactPin);
  const [dialog, setDialog] = useState<"set" | "remove" | null>(null);

  return (
    <View>
      <SectionTitle>Privacy code</SectionTitle>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <EyeOff size={22} color={hasCode ? brand : t.muted} />
          <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
            {hasCode
              ? "The real name of a contact you renamed only shows after you enter this code."
              : "Set a code to see the real name of a contact you renamed. Until then it stays hidden."}
          </Text>
        </View>
        <PrimaryButton title={hasCode ? "Change code" : "Set code"} onPress={() => setDialog("set")} />
        {hasCode && <TextButton title="Remove code" onPress={() => setDialog("remove")} />}
      </Card>
      {dialog && <CodeDialog removing={dialog === "remove"} hasCode={hasCode} onClose={() => setDialog(null)} />}
    </View>
  );
}

function CodeDialog({ removing, hasCode, onClose }: { removing: boolean; hasCode: boolean; onClose: () => void }) {
  const t = useTheme();
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
      setError(codeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={removing ? "Remove privacy code" : hasCode ? "Change privacy code" : "Set a privacy code"}
      onClose={onClose}
    >
      {!removing && (
        <Text style={{ color: t.textSoft, fontSize: 14, lineHeight: 20 }}>
          4 to 8 digits. You'll need it to see the real name of a contact you renamed. Nobody can recover it for you.
        </Text>
      )}
      {(removing || hasCode) && <CodeInput label="Current code" value={current} onChange={setCurrent} autoFocus />}
      {!removing && (
        <>
          <CodeInput label="New code" value={next} onChange={setNext} autoFocus={!hasCode} />
          <CodeInput label="New code again" value={again} onChange={setAgain} onSubmit={() => void save()} />
        </>
      )}
      {(error || mismatch) && <Notice tone="error">{error ?? "The codes don't match."}</Notice>}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <TextButton title="Cancel" onPress={onClose} />
        </View>
        <PrimaryButton
          title={removing ? "Remove" : "Save"}
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
