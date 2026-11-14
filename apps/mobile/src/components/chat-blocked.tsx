import { type ChatDTO, groupClosed } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ban, Lightbulb, Megaphone, UserX } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setBlocked } from "@/lib/actions";
import { isNewsChat } from "@/lib/chats";
import { sendAtLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";

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

  const news = isNewsChat(chat);
  const Icon = chat.group || news ? Megaphone : chat.peerDeleted ? UserX : Ban;
  const message = news
    ? tr.chat.onlySixFrites
    : chat.group
      ? chat.group.membersCanWrite && groupClosed(chat.group)
        ? tr.groups.closedUntil(sendAtLabel(chat.group.closedUntil!))
        : tr.groups.adminsOnly
      : chat.peerDeleted
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
      {news && (
        <Pressable
          onPress={() => router.push("/tips")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.tips, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Lightbulb size={16} color={brand} />
          <Text style={{ color: brand, fontSize: 14, fontWeight: "600" }}>{tr.tips.all}</Text>
        </Pressable>
      )}
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
  tips: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(235,138,0,0.15)" },
});
