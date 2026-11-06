import { fromB64 } from "@six/crypto";
import { unwrap } from "@six/sdk";
import type { LinkPreview } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { e2eeFor } from "@/lib/e2ee";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { QrScanner } from "./add-contact";
import { Text } from "./text";
import { IconButton, PrimaryButton } from "./ui";

type Scanned = { id: string; secret: string; pub: Uint8Array; preview: LinkPreview };

function parse(value: string) {
  const [kind, id, secret, pub] = value.split(":");
  if (kind !== "six-link" || !id || !secret || !pub) return null;
  try {
    return { id, secret, pub: fromB64(pub) };
  } catch {
    return null;
  }
}

/**
 * Signs a computer in by scanning the QR code on its sign-in page. Before approving it shows the computer's own
 * description and a warning, since anyone who gets someone to scan their code would get into that account.
 */
export function LinkComputer({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user?.id);
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [status, setStatus] = useState<"scanning" | "checking" | "approving" | "done" | "bad">("scanning");

  async function onScan(value: string) {
    const code = parse(value);
    if (!code) return setStatus("bad");
    setStatus("checking");
    try {
      const preview = unwrap(
        await six.api.GET("/v1/devices/links/{id}", { params: { path: { id: code.id }, query: { secret: code.secret } } }),
      );
      setScanned({ ...code, preview });
      setStatus("approving");
    } catch {
      setStatus("bad");
    }
  }

  async function approve() {
    if (!scanned) return;
    setStatus("checking");
    try {
      const sealedKey = (await e2eeFor(meId)?.sealBackupKeyFor(scanned.pub)) ?? null;
      unwrap(
        await six.api.POST("/v1/devices/links/{id}", {
          params: { path: { id: scanned.id } },
          body: { secret: scanned.secret, sealedKey },
        }),
      );
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      setStatus("done");
    } catch {
      setStatus("bad");
    }
  }

  const device = scanned?.preview.deviceName ?? tr.auth.browser;

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: t.text }]}>
                {status === "approving" ? tr.settings.linkConfirm : tr.settings.linkComputer}
              </Text>
              <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
            </View>

            {status === "scanning" && (
              <View style={{ alignItems: "center", gap: 12 }}>
                <QrScanner onScan={(v) => void onScan(v)} />
                <Text style={[styles.hint, { color: t.muted }]}>{tr.settings.linkScanHint}</Text>
              </View>
            )}
            {status === "checking" && <Text style={[styles.hint, { color: t.muted }]}>{tr.common.loading}</Text>}
            {status === "approving" && (
              <View style={{ gap: 16 }}>
                <View style={[styles.device, { backgroundColor: t.surfaceAlt }]}>
                  <Monitor size={22} color={t.muted} />
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "600", flex: 1 }}>{device}</Text>
                </View>
                <Text style={[styles.hint, { color: t.textSoft }]}>{tr.settings.linkWarning(device)}</Text>
                <PrimaryButton title={tr.settings.linkApprove} onPress={() => void approve()} />
              </View>
            )}
            {status === "done" && (
              <View style={{ gap: 16 }}>
                <Text style={[styles.hint, { color: t.text }]}>{tr.settings.linkDone}</Text>
                <PrimaryButton title={tr.common.close} onPress={onClose} />
              </View>
            )}
            {status === "bad" && (
              <View style={{ gap: 16 }}>
                <Text style={[styles.hint, { color: t.danger }]}>{tr.settings.linkBadCode}</Text>
                <PrimaryButton title={tr.common.retry} onPress={() => setStatus("scanning")} />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "92%" },
  head: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  device: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14 },
});
