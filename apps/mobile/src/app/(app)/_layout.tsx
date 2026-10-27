import { Stack } from "expo-router";
import { View } from "react-native";
import { LockScreen } from "@/components/app-lock";
import { CallScreen } from "@/components/call-screen";
import { BackupPinPrompt } from "@/components/encryption-settings";
import { Toasts } from "@/components/toasts";
import { useAppLock, useAutoLock } from "@/lib/app-lock";
import { usePush } from "@/lib/push";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  const hasAppLock = useSession((s) => !!s.user?.hasAppLock);
  const locked = useAppLock((s) => s.locked) && hasAppLock;
  usePush();
  useAutoLock();
  return (
    <RealtimeProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
        {!locked && <Toasts />}
        {!locked && <BackupPinPrompt />}
        <CallScreen />
        {locked && <LockScreen />}
      </View>
    </RealtimeProvider>
  );
}
