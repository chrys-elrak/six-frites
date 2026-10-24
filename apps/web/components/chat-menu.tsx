"use client";

import { type ChatDTO, type DeleteScope, durationLabel } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, updateChatSettings } from "@/lib/actions";
import { Sheet } from "./sheet";

const DAY = 24 * 60 * 60;
const AUTO_DELETE_OPTIONS = [DAY, 7 * DAY, 30 * DAY];

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
  const [view, setView] = useState<"menu" | "delete" | "autoDelete">("menu");
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

  if (view === "delete") {
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

  if (view === "autoDelete") {
    return (
      <Sheet
        title={`Delete new messages for you and ${peerName} after`}
        onClose={onClose}
        actions={[
          ...AUTO_DELETE_OPTIONS.map((secs) => ({
            label: `${durationLabel(secs)}${chat.autoDeleteSecs === secs ? " ✓" : ""}`,
            onSelect: () => settings({ autoDeleteSecs: secs }),
          })),
          ...(chat.autoDeleteSecs
            ? [{ label: "Off", destructive: true, onSelect: () => settings({ autoDeleteSecs: null }) }]
            : []),
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
        {
          label: `Auto-delete: ${chat.autoDeleteSecs ? durationLabel(chat.autoDeleteSecs) : "Off"}`,
          keepOpen: true,
          onSelect: () => setView("autoDelete"),
        },
        { label: "Delete chat", destructive: true, keepOpen: true, onSelect: () => setView("delete") },
      ]}
    />
  );
}
