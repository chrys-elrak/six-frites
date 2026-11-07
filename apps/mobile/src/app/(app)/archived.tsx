import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { LockScreen } from "@/components/app-lock";
import { BrandBar } from "@/components/brand-bar";
import { ChatList } from "@/components/chat-list";
import { useT } from "@/lib/i18n";
import { setArchiveOpen, useAppLock } from "@/lib/app-lock";
import { useSession } from "@/lib/session";

export default function Archived() {
  const tr = useT();
  const hasAppLock = useSession((s) => s.user!.hasAppLock);
  const open = useAppLock((s) => s.archiveOpen);
  useEffect(() => () => setArchiveOpen(false), []);
  return (
    <View style={{ flex: 1 }}>
      <BrandBar />
      {hasAppLock && !open ? (
        <LockScreen title={tr.common.archived} onUnlock={() => setArchiveOpen(true)} onCancel={() => router.back()} />
      ) : (
        <ChatList archived />
      )}
    </View>
  );
}
