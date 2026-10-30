import type { ChatDTO } from "@six/shared";
import { X } from "lucide-react-native";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isFrozen, useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Text } from "./text";
import { IconButton } from "./ui";

/** A bottom sheet listing the chats I can still write in, to pick one. */
export function ChatPicker({
  title,
  empty,
  onPick,
  onClose,
}: {
  title: string;
  empty: string;
  onPick: (chat: ChatDTO) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const meId = useSession((s) => s.user!.id);
  const chats = (useChats().data ?? []).filter((c) => !isFrozen(c) && c.members.some((m) => m.user.id !== meId));

  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>{title}</Text>
            <IconButton Icon={X} label={tr.common.close} onPress={onClose} />
          </View>
          {chats.length ? (
            <FlatList
              data={chats}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item: c }) => (
                <Pressable
                  onPress={() => onPick(c)}
                  style={({ pressed }) => [styles.friend, pressed && { backgroundColor: t.pressed }]}
                >
                  <Avatar user={c.members.find((m) => m.user.id !== meId)!.user} />
                  <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "500" }}>
                    {c.title}
                  </Text>
                </Pressable>
              )}
            />
          ) : (
            <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", paddingVertical: 24 }}>{empty}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  friend: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12 },
});
