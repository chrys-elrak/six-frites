import { Stack } from "expo-router";
import { View } from "react-native";
import { CallScreen } from "@/components/call-screen";
import { Toasts } from "@/components/toasts";
import { usePush } from "@/lib/push";
import { RealtimeProvider } from "@/lib/realtime";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  usePush();
  return (
    <RealtimeProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
        <Toasts />
        <CallScreen />
      </View>
    </RealtimeProvider>
  );
}
