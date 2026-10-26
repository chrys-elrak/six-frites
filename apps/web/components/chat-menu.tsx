"use client";

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
import { deleteChat, setBlocked, updateChatSettings } from "@/lib/actions";
import { useSession } from "@/lib/session";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemeDialog } from "./chat-background";
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
  const [view, setView] = useState<"menu" | "delete" | "autoDelete" | "custom" | "theme" | "customTheme" | "block">(
    "menu",
  );
  const meId = useSession((s) => s.user?.id);
  const peerId = chat.members.find((m) => m.user.id !== meId)?.user.id;
  const frozen = chat.blockedByMe || chat.blockedByThem || chat.peerDeleted;
  const block = (blocked: boolean) => peerId && void setBlocked(qc, chat, peerId, blocked).catch(() => null);
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

  if (view === "custom") {
    return (
      <AutoDeleteCustom
        value={chat.autoDeleteSecs}
        peerName={peerName}
        onSave={(secs) => settings({ autoDeleteSecs: secs })}
        onClose={onClose}
      />
    );
  }

  if (view === "customTheme") {
    return (
      <CustomThemeDialog
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
    const custom = chat.autoDeleteSecs && !(AUTO_DELETE_PRESETS as readonly number[]).includes(chat.autoDeleteSecs);
    return (
      <Sheet
        title={`Delete new messages for you and ${peerName} after`}
        onClose={onClose}
        actions={[
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            label: `${durationLabel(secs)}${chat.autoDeleteSecs === secs ? " ✓" : ""}`,
            onSelect: () => settings({ autoDeleteSecs: secs }),
          })),
          {
            label: custom ? `Custom: ${durationLabel(chat.autoDeleteSecs!)} ✓` : "Custom…",
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

  if (view === "block") {
    return (
      <Sheet
        title={`Block ${peerName}? Neither of you will be able to send messages here, and ${peerName} will see that you blocked them.`}
        onClose={onClose}
        actions={[{ label: `Block ${peerName}`, destructive: true, onSelect: () => block(true) }]}
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
        ...(frozen
          ? []
          : [
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
            ]),
        ...(chat.peerDeleted
          ? []
          : chat.blockedByMe
            ? [{ label: `Unblock ${peerName}`, onSelect: () => block(false) }]
            : [{ label: `Block ${peerName}`, destructive: true, keepOpen: true, onSelect: () => setView("block") }]),
        { label: "Delete chat", destructive: true, keepOpen: true, onSelect: () => setView("delete") },
      ]}
    />
  );
}
