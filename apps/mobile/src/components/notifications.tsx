import { notificationText } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Bell, Settings2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { listTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { markNotificationsSeen, useNotifications } from "@/lib/notifications";
import { brand, useTheme } from "@/lib/theme";
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
        renderItem={({ item: n }) => (
          <Pressable
            disabled={!n.chatId}
            onPress={() => router.push(`/chats/${n.chatId}`)}
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
        )}
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  note: { padding: 16, fontSize: 14 },
});
