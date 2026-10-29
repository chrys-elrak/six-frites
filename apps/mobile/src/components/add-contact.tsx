import { unwrap } from "@six/sdk";
import { useMutation } from "@tanstack/react-query";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { ArrowLeft, QrCode, Search, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Text, TextInput } from "./text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { FoundUser, findErrorText } from "./found-user";
import { IconButton, PrimaryButton } from "./ui";

function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const t = useTheme();
  const tr = useT();
  const { width } = useWindowDimensions();
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);
  const side = Math.min(width - 40, 360);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
        <Text style={{ color: t.muted, textAlign: "center" }}>
          {permission.canAskAgain ? tr.contacts.allowCameraToScan : tr.contacts.cameraDenied}
        </Text>
        {permission.canAskAgain && <PrimaryButton title={tr.contacts.allowCamera} onPress={() => void request()} />}
      </View>
    );
  }

  return (
    <View style={[styles.scanner, { width: side, height: side }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(r: BarcodeScanningResult) => {
          if (done.current || !r.data) return;
          done.current = true;
          onScan(r.data);
        }}
      />
      <View style={styles.frame} pointerEvents="none" />
    </View>
  );
}

export function AddContact({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);

  const find = useMutation({
    mutationFn: async (q: string) => ({
      q,
      found: unwrap(await six.api.GET("/v1/users/find", { params: { query: { q } } })),
    }),
  });

  function onScan(value: string) {
    setScanning(false);
    setQuery(value);
    find.mutate(value);
  }

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            {scanning && <IconButton Icon={ArrowLeft} label={tr.common.back} onPress={() => setScanning(false)} />}
            <Text style={[styles.title, { color: t.text }]}>{scanning ? tr.contacts.scanQr : tr.contacts.addContact}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>

          {scanning ? (
            <View style={{ alignItems: "center" }}>
              <QrScanner onScan={onScan} />
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              <View style={styles.row}>
                <View style={[styles.search, { backgroundColor: t.field }]}>
                  <Search size={16} color={t.muted} />
                  <TextInput
                    autoFocus
                    value={query}
                    onChangeText={(v) => {
                      setQuery(v);
                      find.reset();
                    }}
                    onSubmitEditing={() => query.trim() && find.mutate(query.trim())}
                    returnKeyType="search"
                    placeholder={tr.contacts.findPlaceholder}
                    placeholderTextColor={t.muted}
                    accessibilityLabel={tr.contacts.findLabel}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    style={[styles.input, { color: t.text }]}
                  />
                </View>
                <IconButton Icon={QrCode} label={tr.contacts.scanQr} onPress={() => setScanning(true)} />
              </View>

              {find.isPending && <Text style={[styles.hint, { color: t.muted }]}>{tr.contacts.searching}</Text>}
              {find.isError && <Text style={[styles.hint, { color: t.danger }]}>{findErrorText(find.error, tr)}</Text>}
              {find.data && <FoundUser found={find.data.found} query={find.data.q} onAdded={onClose} />}
              {find.isIdle && (
                <Text style={[styles.hint, { color: t.muted }]}>{tr.contacts.findHint}</Text>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  hint: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  scanner: { borderRadius: 20, overflow: "hidden", backgroundColor: "#000" },
  frame: {
    position: "absolute",
    top: "18%",
    left: "18%",
    right: "18%",
    bottom: "18%",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
  },
});
