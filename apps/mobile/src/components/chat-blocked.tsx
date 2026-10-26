import type { ChatDTO } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, UserX } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setBlocked } from "@/lib/actions";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/** Takes the composer's place when nobody can write in this chat, saying why. */
export function ChatBlocked({ chat, peerId, peerName }: { chat: ChatDTO; peerId: string; peerName: string }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  async function unblock() {
    setBusy(true);
    await setBlocked(qc, chat, peerId, false).catch(() => null);
    setBusy(false);
  }

  const Icon = chat.peerDeleted ? UserX : Ban;
  const message = chat.peerDeleted
    ? tr.chat.peerDeleted
    : chat.blockedByMe
      ? tr.chat.youBlocked(peerName)
      : tr.chat.blockedYou(peerName);

  return (
    <View
      style={[styles.bar, { backgroundColor: t.bg, borderColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <Icon size={20} color={t.faint} />
      <Text style={{ flex: 1, color: t.textSoft, fontSize: 14 }}>{message}</Text>
      {chat.blockedByMe && !chat.peerDeleted && (
        <Pressable
          onPress={() => void unblock()}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: t.inverse, opacity: busy || pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: t.onInverse, fontSize: 14, fontWeight: "600" }}>{tr.common.unblock}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  button: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
