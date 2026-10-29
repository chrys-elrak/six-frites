import { Tabs } from "expo-router/js-tabs";
import { View } from "react-native";
import { BrandBar } from "@/components/brand-bar";
import { MessageCircle, Settings } from "lucide-react-native";
import { useChats } from "@/lib/chats";
import { usePlainFont } from "@/lib/font";
import { useT } from "@/lib/i18n";
import { brand, useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  const chats = useChats();
  const plain = usePlainFont((s) => s.on);
  const unread = chats.data?.filter((c) => !c.muted && c.unreadCount > 0).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BrandBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: brand,
          tabBarInactiveTintColor: t.muted,
          tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", fontFamily: plain ? "Inter" : undefined },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: tr.common.chats,
            tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
            tabBarIcon: ({ color, focused }) => (
              <MessageCircle color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: tr.common.settings,
            tabBarIcon: ({ color, focused }) => <Settings color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />,
          }}
        />
      </Tabs>
    </View>
  );
}
