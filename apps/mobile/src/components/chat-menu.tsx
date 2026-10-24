import { AUTO_DELETE_PRESETS, type ChatDTO, type DeleteScope, durationLabel } from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, updateChatSettings } from "@/lib/actions";
import { AutoDeleteCustom } from "./auto-delete-custom";
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
  const [view, setView] = useState<"menu" | "delete" | "autoDelete" | "custom">("menu");
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

  if (view === "custom") {
    return (
      <AutoDeleteCustom
        current={chat.autoDeleteSecs}
        peerName={peerName}
        onSet={(secs) => settings({ autoDeleteSecs: secs })}
        onClose={onClose}
      />
    );
  }

  if (view === "autoDelete") {
    const current = chat.autoDeleteSecs;
    const custom = current !== null && !(AUTO_DELETE_PRESETS as readonly number[]).includes(current);
    return (
      <Sheet
        title={`Delete new messages for you and ${peerName} after`}
        onClose={onClose}
        actions={[
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            label: `${durationLabel(secs)}${current === secs ? " ✓" : ""}`,
            onSelect: () => settings({ autoDeleteSecs: secs }),
          })),
          {
            label: custom ? `Custom: ${durationLabel(current)} ✓` : "Custom…",
            keepOpen: true,
            onSelect: () => setView("custom"),
          },
          ...(chat.autoDeleteSecs
            ? [{ label: "Off", destructive: true, onSelect: () => settings({ autoDeleteSecs: null }) }]
            : []),
        ]}
      />
    );
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
