import { Stack } from "expo-router";
import { View } from "react-native";
import { Toasts } from "@/components/toasts";
import { RealtimeProvider } from "@/lib/realtime";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  return (
    <RealtimeProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
        <Toasts />
      </View>
    </RealtimeProvider>
  );
}
