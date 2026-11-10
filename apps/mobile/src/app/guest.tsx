import { View } from "react-native";
import { chatTheme } from "@six/shared";
import { AnonInbox } from "@/components/anon-inbox";
import { Wallpaper } from "@/components/chat-background";
import { RealtimeProvider } from "@/lib/realtime";
import { useTheme } from "@/lib/theme";

export default function GuestInbox() {
  const t = useTheme();
  return (
    <RealtimeProvider>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Wallpaper theme={chatTheme(null)} dark={t.dark} id="app" />
        <AnonInbox guest />
      </View>
    </RealtimeProvider>
  );
}
