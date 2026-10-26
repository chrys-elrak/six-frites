"use client";

import { Archive } from "lucide-react";
import { EmptyPane } from "@/components/empty-pane";
import { useT } from "@/lib/i18n";

export default function ArchivedIndex() {
  const tr = useT();
  return <EmptyPane Icon={Archive}>{tr.chats.archivedHint}</EmptyPane>;
}
