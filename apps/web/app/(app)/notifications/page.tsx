"use client";

import { Bell } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";
import { useT } from "@/lib/i18n";

export default function NotificationsIndex() {
  const tr = useT();
  return <EmptyPane Icon={Bell}>{tr.chats.pickChat}</EmptyPane>;
}
