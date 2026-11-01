import { unwrap } from "@six/sdk";
import { useState } from "react";
import { Linking, Modal, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { logout, useSession } from "@/lib/session";
import { WEB_URL, six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Text } from "./text";
import { Notice, PrimaryButton, TextButton } from "./ui";

/** Asks someone who just joined to accept the terms before anything else; the terms open in the browser. */
export function TermsGate() {
  const t = useTheme();
  const tr = useT();
  const user = useSession((s) => (s.status === "authed" ? s.user : null));
  const setUser = useSession((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!user || user.termsAccepted) return null;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      setUser(unwrap(await six.api.POST("/v1/me/terms")));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.title, { color: t.text }]}>{tr.legal.welcomeTitle}</Text>
          <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>{tr.legal.welcomeBody}</Text>
          <View style={{ alignItems: "flex-start" }}>
            <TextButton title={tr.legal.terms} color={brand} onPress={() => void Linking.openURL(`${WEB_URL}/terms`)} />
            <TextButton title={tr.legal.privacy} color={brand} onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)} />
          </View>
          {failed && <Notice tone="error">{tr.common.somethingWrongRetry}</Notice>}
          <PrimaryButton title={tr.legal.accept} onPress={() => void accept()} busy={busy} disabled={busy} />
          <View style={{ alignItems: "center" }}>
            <TextButton title={tr.legal.decline} onPress={() => void logout()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: "700" },
});
