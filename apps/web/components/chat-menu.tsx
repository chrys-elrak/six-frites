"use client";

import type { ChatDTO, DeleteScope } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, updateChatSettings } from "@/lib/actions";
import { Sheet } from "./sheet";

export function ChatMenu({
  chat,
  peerName,
  onClose,
  onDeleted,
}: {
  chat: ChatDTO;
  peerName: string;
  onClose: () => void;
  onDeleted?: (scope: DeleteScope) => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const settings = (input: Parameters<typeof updateChatSettings>[2]) =>
    void updateChatSettings(qc, chat.id, input).catch(() => null);

  async function remove(scope: DeleteScope) {
    try {
      await deleteChat(qc, chat.id, scope);
      onDeleted?.(scope);
    } catch {
      void qc.invalidateQueries({ queryKey: ["chats"] });
    }
  }

  if (confirming) {
    return (
      <Sheet
        title="Delete this chat?"
        onClose={onClose}
        actions={[
          { label: "Delete for me", destructive: true, onSelect: () => void remove("me") },
          {
            label: `Delete all messages for me and ${peerName}`,
            destructive: true,
            onSelect: () => void remove("all"),
          },
        ]}
      />
    );
  }

  return (
    <Sheet
      title={chat.title}
      onClose={onClose}
      actions={[
        { label: chat.pinned ? "Unpin" : "Pin", onSelect: () => settings({ pinned: !chat.pinned }) },
        { label: chat.muted ? "Unmute" : "Mute", onSelect: () => settings({ muted: !chat.muted }) },
        { label: chat.archived ? "Unarchive" : "Archive", onSelect: () => settings({ archived: !chat.archived }) },
        { label: "Delete chat", destructive: true, keepOpen: true, onSelect: () => setConfirming(true) },
      ]}
    />
  );
}
