import { MessageCircle } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";

export default function ChatsIndex() {
  return <EmptyPane Icon={MessageCircle}>Pick a chat to start talking.</EmptyPane>;
}
