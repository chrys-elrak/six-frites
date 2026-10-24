import { Tabs } from "expo-router/js-tabs";
import { MessageCircle, Settings, Users } from "lucide-react-native";
import { useChats } from "@/lib/chats";
import { brand, useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  const chats = useChats();
  const unread = chats.data?.filter((c) => !c.muted && c.unreadCount > 0).length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarIcon: ({ color, focused }) => <MessageCircle color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, focused }) => <Users color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => <Settings color={color} size={24} strokeWidth={focused ? 2.4 : 1.8} />,
        }}
      />
    </Tabs>
  );
}
