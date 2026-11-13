import { Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { LockScreen } from "@/components/app-lock";
import { CallScreen } from "@/components/call-screen";
import { MiniPlayer, useMiniPlayer } from "@/components/mini-player";
import { BackupPinPrompt } from "@/components/encryption-settings";
import { StoryPostBar } from "@/components/story-post-bar";
import { SharedLink } from "@/components/shared-link";
import { StorageFullPrompt } from "@/components/storage-full";
import { Toasts } from "@/components/toasts";
import { TourPrompt } from "@/components/tour";
import { LiveInvites, UnfinishedGame } from "@/components/live";
import { useAppLock, useAutoLock } from "@/lib/app-lock";
import { usePush } from "@/lib/push";
import { RealtimeProvider } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const t = useTheme();
  const hasAppLock = useSession((s) => !!s.user?.hasAppLock);
  const locked = useAppLock((s) => s.locked) && hasAppLock;
  const insets = useSafeAreaInsets();
  const mini = !!useMiniPlayer();
  usePush();
  useAutoLock();
  return (
    <RealtimeProvider>
      <View style={{ flex: 1 }}>
        <MiniPlayer />
        <SafeAreaInsetsContext.Provider value={mini ? { ...insets, top: 0 } : insets}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
        </SafeAreaInsetsContext.Provider>
        {!locked && <Toasts />}
        {!locked && <StoryPostBar />}
        {!locked && <StorageFullPrompt />}
        {!locked && <LiveInvites />}
        {!locked && <UnfinishedGame />}
        {!locked && <BackupPinPrompt />}
        {!locked && <TourPrompt />}
        {!locked && <SharedLink />}
        <CallScreen />
        {locked && <LockScreen />}
      </View>
    </RealtimeProvider>
  );
}
