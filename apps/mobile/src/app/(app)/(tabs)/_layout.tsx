import { Tabs } from "expo-router/js-tabs";
import { type ColorValue, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
    return (
      <View style={[styles.pill, focused && { backgroundColor: `${brand}26` }]}>
        <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 1.8} />
      </View>
    );
  };

/** A second coat of glass: the header lies on the screen's own glass and the tab bar doesn't, so this evens them out. */
function Glass() {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.glass }} />;
}

/** A thin bottom inset is only a swipe handle, so the tabs sit lower into it. A tall one holds Android's buttons and stays whole. */
const tabInset = (bottom: number) => (bottom > 34 ? bottom : Math.round(bottom * 0.65));

/** The bar has no elevation: on Android its shadow shows through the glass as a pale box. */
export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  const chats = useChats();
  const notifications = useNotifications();
  const insets = useSafeAreaInsets();
  const unread = chats.data?.filter((c) => !c.muted && c.unreadCount > 0).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Wallpaper theme={chatTheme(null)} dark={t.dark} id="app" />
      <Tabs
        safeAreaInsets={{ bottom: tabInset(insets.bottom) }}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: brand,
          tabBarInactiveTintColor: t.muted,
          sceneStyle: { backgroundColor: "transparent" },
          tabBarStyle: { backgroundColor: t.glass, borderTopColor: t.border, elevation: 0 },
          tabBarBackground: () => <Glass />,
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

const styles = StyleSheet.create({
  pill: { width: 48, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
