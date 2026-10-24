import { Stack } from "expo-router";
import { RealtimeProvider } from "@/lib/realtime";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  return (
    <RealtimeProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </RealtimeProvider>
  );
}
