import { useLocalSearchParams } from "expo-router";
import { Conversation } from "@/components/conversation";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Conversation key={id} chatId={id} />;
}
