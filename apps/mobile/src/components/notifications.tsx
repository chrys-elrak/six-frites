import { type NotificationDTO, notificationText } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Bell, Mail, MailOpen, Settings2, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { deleteNotification, markNotification, markNotificationsSeen, useNotifications } from "@/lib/notifications";
import { useSwipeRow } from "@/lib/swipe";
import { brand, brandInk, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { BrandBar } from "./brand-bar";
import { Text } from "./text";
import { NotificationSettings } from "./settings-panel";
import { EmptyState, IconButton, Popup } from "./ui";

export function Notifications() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const list = useNotifications();
  const unread = list.data?.unread ?? 0;
  const [settings, setSettings] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (unread > 0) void markNotificationsSeen(qc);
    }, [unread, qc]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.glass }}>
      <BrandBar>
        <IconButton
          Icon={Settings2}
          color={brand}
          label={tr.settings.notifications}
          onPress={() => setSettings(true)}
        />
      </BrandBar>
      {settings && (
        <Popup onClose={() => setSettings(false)}>
          <NotificationSettings />
        </Popup>
      )}
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            colors={[brand]}
            progressBackgroundColor={t.surface}
          />
        }
        renderItem={({ item }) => <Row n={item} />}
        ListEmptyComponent={
          list.isPending ? (
            <Text style={[styles.note, { color: t.muted }]}>{tr.common.loading}</Text>
          ) : list.isError ? (
            <Text style={[styles.note, { color: t.danger }]}>{tr.common.somethingWrong}</Text>
          ) : (
            <View style={{ flex: 1, justifyContent: "center" }}>
              <EmptyState Icon={Bell}>{tr.notifications.empty}</EmptyState>
            </View>
          )
        }
      />
    </View>
  );
}

/** One notification: swipe it right to delete it, left to mark it unread or read. */
function Row({ n }: { n: NotificationDTO }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const remove = () => void deleteNotification(qc, n.id);
  const toggle = () => void markNotification(qc, n.id, !n.unread);
  const swipe = useSwipeRow(remove, toggle);
  const Read = n.unread ? MailOpen : Mail;
  return (
    <GestureDetector gesture={swipe.gesture}>
      <View>
        <Animated.View pointerEvents="none" style={[styles.swipeHint, { left: 20 }, swipe.right]}>
          <View style={[styles.swipeIcon, { backgroundColor: t.danger }]}>
            <Trash2 size={20} color="#fff" />
          </View>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.swipeHint, { right: 20 }, swipe.left]}>
          <View style={[styles.swipeIcon, { backgroundColor: brand }]}>
            <Read size={20} color={brandInk} />
          </View>
        </Animated.View>
        <Animated.View style={swipe.moving}>
          <Pressable
            onPress={() => {
              if (n.unread) void markNotification(qc, n.id, false);
              if (n.chatId) router.push(`/chats/${n.chatId}`);
            }}
            accessibilityActions={[
              { name: "delete", label: tr.common.delete },
              { name: "toggle", label: n.unread ? tr.notifications.markRead : tr.notifications.markUnread },
            ]}
            onAccessibilityAction={(e) => (e.nativeEvent.actionName === "delete" ? remove() : toggle())}
            style={({ pressed }) => [
              styles.row,
              n.unread && { backgroundColor: "rgba(235,138,0,0.10)" },
              pressed && { backgroundColor: t.pressed },
            ]}
          >
            <Avatar user={n.user} size="md" />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 15, lineHeight: 20 }}>{notificationText(tr.notifications, n)}</Text>
              <Text style={{ color: n.unread ? brand : t.muted, fontSize: 12, fontWeight: n.unread ? "600" : "400" }}>
                {listTime(n.createdAt)}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  swipeHint: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", opacity: 0 },
  swipeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  note: { padding: 16, fontSize: 14 },
});
