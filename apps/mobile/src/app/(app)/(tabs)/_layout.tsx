import { Tabs } from "expo-router/js-tabs";
import { type ColorValue, View } from "react-native";
import { chatTheme } from "@six/shared";
import { Wallpaper } from "@/components/chat-background";
import { Bell, type LucideIcon, MessageCircle, Settings, Users, VenetianMask } from "lucide-react-native";
import { useChats } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useNotifications } from "@/lib/notifications";
import { brand, useTheme } from "@/lib/theme";

const badge = (n: number) => (n > 0 ? (n > 99 ? "99+" : n) : undefined);

const icon = (Icon: LucideIcon) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 1.8} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  const chats = useChats();
  const notifications = useNotifications();
  const unread = chats.data?.filter((c) => !c.muted && c.unreadCount > 0).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Wallpaper theme={chatTheme(null)} dark={t.dark} id="app" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: brand,
          tabBarInactiveTintColor: t.muted,
          sceneStyle: { backgroundColor: "transparent" },
          tabBarStyle: { backgroundColor: t.glass, borderTopColor: t.border },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: tr.common.chats, tabBarBadge: badge(unread), tabBarIcon: icon(MessageCircle) }}
        />
        <Tabs.Screen name="contacts" options={{ title: tr.contacts.title, tabBarIcon: icon(Users) }} />
        <Tabs.Screen
          name="notifications"
          options={{
            title: tr.notifications.title,
            tabBarBadge: badge(notifications.data?.unread ?? 0),
            tabBarIcon: icon(Bell),
          }}
        />
        <Tabs.Screen name="inbox" options={{ title: tr.ask.tab, tabBarIcon: icon(VenetianMask) }} />
        <Tabs.Screen name="settings" options={{ title: tr.common.settings, tabBarIcon: icon(Settings) }} />
      </Tabs>
    </View>
  );
}
