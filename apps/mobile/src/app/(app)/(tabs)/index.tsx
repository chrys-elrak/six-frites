import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { ChatList } from "@/components/chat-list";
import { askForReviewSometimes } from "@/lib/review";

export default function ChatsTab() {
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const returning = seen.current;
      seen.current = true;
      const timer = setTimeout(() => void askForReviewSometimes(returning).catch(() => null), 2000);
      return () => clearTimeout(timer);
    }, []),
  );
  return <ChatList />;
}
