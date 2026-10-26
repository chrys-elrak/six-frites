"use client";

import { MessageCircle } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";
import { useT } from "@/lib/i18n";

export default function ChatsIndex() {
  const tr = useT();
  return <EmptyPane Icon={MessageCircle}>{tr.chats.pickChat}</EmptyPane>;
}
