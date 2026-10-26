"use client";

import { Settings } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";
import { useT } from "@/lib/i18n";

export default function SettingsIndex() {
  const tr = useT();
  return <EmptyPane Icon={Settings}>{tr.chats.settingsHint}</EmptyPane>;
}
