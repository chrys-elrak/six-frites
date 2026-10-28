import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { LockScreen } from "@/components/app-lock";
import { BrandBar } from "@/components/brand-bar";
import { ChatList } from "@/components/chat-list";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function Archived() {
  const tr = useT();
  const hasAppLock = useSession((s) => s.user!.hasAppLock);
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <BrandBar />
      {hasAppLock && !open ? (
        <LockScreen title={tr.common.archived} onUnlock={() => setOpen(true)} onCancel={() => router.back()} />
      ) : (
        <ChatList archived />
      )}
    </View>
  );
}
