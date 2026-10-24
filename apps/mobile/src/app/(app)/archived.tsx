import { View } from "react-native";
import { BrandBar } from "@/components/brand-bar";
import { ChatList } from "@/components/chat-list";

export default function Archived() {
  return (
    <View style={{ flex: 1 }}>
      <BrandBar />
      <ChatList archived />
    </View>
  );
}
