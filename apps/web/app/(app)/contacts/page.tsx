"use client";

import { Users } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";
import { useT } from "@/lib/i18n";

export default function ContactsIndex() {
  const tr = useT();
  return <EmptyPane Icon={Users}>{tr.chats.pickContact}</EmptyPane>;
}
