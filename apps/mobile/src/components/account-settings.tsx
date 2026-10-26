import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteAccount, unblockUser } from "@/lib/actions";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { logout } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Card, Divider, SectionTitle, TextButton } from "./ui";

export function BlockedPeople() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: async () => unwrap(await six.api.GET("/v1/me/blocks")).items,
  });
  const unblock = useMutation({ mutationFn: (userId: string) => unblockUser(qc, userId) });
  const items = blocks.data ?? [];
  if (!items.length) return null;

  return (
    <View>
      <SectionTitle>{tr.settings.blockedPeople}</SectionTitle>
      <Card>
        {items.map((b, i) => (
          <View key={b.user.id}>
            {i > 0 && <Divider />}
            <View style={styles.row}>
              <Avatar user={b.user} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>
                  {b.user.displayName}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{tr.settings.blockedAgo(timeAgo(b.createdAt))}</Text>
              </View>
              <TextButton
                title={tr.common.unblock}
                onPress={() => unblock.mutate(b.user.id)}
                disabled={unblock.isPending && unblock.variables === b.user.id}
              />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

export function AccountCard() {
  const t = useTheme();
  const tr = useT();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <SectionTitle>{tr.settings.account}</SectionTitle>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "500", fontSize: 15 }}>{tr.settings.deleteAccount}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{tr.settings.deleteAccountHint}</Text>
          </View>
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.danger, { backgroundColor: t.danger, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.dangerText}>{tr.settings.deleteEllipsis}</Text>
          </Pressable>
        </View>
      </Card>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </View>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      await deleteAccount();
      await logout();
    },
  });
  const ready = typed.trim() === "DELETE";

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding" style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.title, { color: t.text }]}>{tr.settings.deleteAccountTitle}</Text>
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
            {tr.settings.deleteConsequences.map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ color: t.muted }}>•</Text>
                <Text style={{ flex: 1, color: t.textSoft, fontSize: 14, lineHeight: 20 }}>{line}</Text>
              </View>
            ))}
          </ScrollView>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={tr.settings.typeDelete}
            placeholderTextColor={t.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={tr.settings.typeDelete}
            style={[styles.input, { backgroundColor: t.field, color: t.text }]}
          />
          {remove.isError && (
            <Text style={{ color: t.danger, fontSize: 13, textAlign: "center" }}>
              {remove.error instanceof SixApiError ? remove.error.message : tr.settings.couldNotDeleteAccount}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <TextButton title={tr.common.cancel} onPress={onClose} />
            </View>
            <Pressable
              onPress={() => remove.mutate()}
              disabled={!ready || remove.isPending}
              accessibilityRole="button"
              style={[styles.danger, styles.confirm, { backgroundColor: t.danger, opacity: ready && !remove.isPending ? 1 : 0.5 }]}
            >
              <Text style={styles.dangerText}>{remove.isPending ? tr.settings.deleting : tr.settings.deleteMyAccount}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  danger: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  dangerText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  confirm: { flex: 1, paddingVertical: 12 },
  wrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  panel: { borderRadius: 20, padding: 16, gap: 14 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, textAlign: "center", letterSpacing: 2 },
});
