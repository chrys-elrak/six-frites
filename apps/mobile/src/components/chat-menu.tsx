import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  type ChatDTO,
  type DeleteScope,
  chatTheme,
  customThemeColor,
  customThemeId,
  durationLabel,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, updateChatSettings } from "@/lib/actions";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemePicker } from "./custom-theme";
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
  const [view, setView] = useState<"menu" | "delete" | "autoDelete" | "custom" | "theme" | "customTheme">("menu");
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

  if (view === "customTheme") {
    return (
      <CustomThemePicker
        title={`Custom background for you and ${peerName}`}
        current={chat.theme}
        onPick={(mine, theirs) => settings({ theme: customThemeId(mine, theirs) })}
        onClose={onClose}
      />
    );
  }

  if (view === "theme") {
    const customHex = customThemeColor(chat.theme);
    return (
      <Sheet
        title={`Chat background for you and ${peerName}`}
        onClose={onClose}
        actions={[
          ...CHAT_THEMES.map((t) => ({
            label: `${t.name}${chat.theme === t.id ? " ✓" : ""}`,
            onSelect: () => settings({ theme: t.id }),
          })),
          { label: customHex ? "Custom colour ✓" : "Custom colour…", keepOpen: true, onSelect: () => setView("customTheme") },
          ...(chat.theme
            ? [{ label: "Back to each person's default", destructive: true, onSelect: () => settings({ theme: null }) }]
            : []),
        ]}
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
        {
          label: `Background: ${chat.theme ? chatTheme(chat.theme).name : "Default"}`,
          keepOpen: true,
          onSelect: () => setView("theme"),
        },
        { label: "Delete chat", destructive: true, keepOpen: true, onSelect: () => setView("delete") },
      ]}
    />
  );
}
