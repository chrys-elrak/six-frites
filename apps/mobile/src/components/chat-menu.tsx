import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  type ChatDTO,
  type DeleteScope,
  customThemeColor,
  customThemeId,
  durationLabel,
  themeName,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, removeContact, setBlocked, updateChatSettings } from "@/lib/actions";
import { isFrozen } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemePicker } from "./custom-theme";
import { Sheet } from "./sheet";

export function ChatMenu({
  chat,
  peerName,
  peerId,
  onClose,
  onDeleted,
}: {
  chat: ChatDTO;
  peerName: string;
  peerId: string;
  onClose: () => void;
  onDeleted?: (scope: DeleteScope) => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const [view, setView] = useState<
    "menu" | "delete" | "block" | "autoDelete" | "custom" | "theme" | "customTheme" | "removeContact"
  >("menu");
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

  async function removeFromContacts() {
    try {
      await removeContact(qc, chat.id, peerId);
      onDeleted?.("me");
    } catch {
      void qc.invalidateQueries({ queryKey: ["chats"] });
    }
  }

  if (view === "removeContact") {
    return (
      <Sheet
        title={tr.chat.removeContactConfirm(peerName)}
        onClose={onClose}
        actions={[{ label: tr.chat.removeContact(peerName), destructive: true, onSelect: () => void removeFromContacts() }]}
      />
    );
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
        title={tr.chat.customBackgroundFor(peerName)}
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
        title={tr.chat.backgroundFor(peerName)}
        onClose={onClose}
        actions={[
          ...CHAT_THEMES.map((t) => ({
            label: `${themeName(t.id, tr)}${chat.theme === t.id ? " ✓" : ""}`,
            onSelect: () => settings({ theme: t.id }),
          })),
          {
            label: `${tr.chat.customColour}${customHex ? " ✓" : "…"}`,
            keepOpen: true,
            onSelect: () => setView("customTheme"),
          },
          ...(chat.theme
            ? [{ label: tr.chat.defaultEach, destructive: true, onSelect: () => settings({ theme: null }) }]
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
        title={tr.chat.autoDeleteFor(peerName)}
        onClose={onClose}
        actions={[
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            label: `${durationLabel(secs, tr)}${current === secs ? " ✓" : ""}`,
            onSelect: () => settings({ autoDeleteSecs: secs }),
          })),
          {
            label: custom ? `${tr.chat.customDuration(durationLabel(current, tr))} ✓` : tr.common.custom,
            keepOpen: true,
            onSelect: () => setView("custom"),
          },
          ...(chat.autoDeleteSecs
            ? [{ label: tr.chat.turnOff, destructive: true, onSelect: () => settings({ autoDeleteSecs: null }) }]
            : []),
        ]}
      />
    );
  }

  if (view === "block") {
    return (
      <Sheet
        title={tr.chat.blockConfirm(peerName)}
        onClose={onClose}
        actions={[
          {
            label: tr.chat.blockName(peerName),
            destructive: true,
            onSelect: () => void setBlocked(qc, chat, peerId, true).catch(() => null),
          },
        ]}
      />
    );
  }

  if (view === "delete") {
    return (
      <Sheet
        title={tr.chat.deleteChatTitle}
        onClose={onClose}
        actions={[
          { label: tr.chat.deleteForMe, destructive: true, onSelect: () => void remove("me") },
          {
            label: tr.chat.deleteAllFor(peerName),
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
        { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
        { label: chat.muted ? tr.common.unmute : tr.common.mute, onSelect: () => settings({ muted: !chat.muted }) },
        {
          label: chat.archived ? tr.chat.unarchive : tr.chat.archive,
          onSelect: () => settings({ archived: !chat.archived }),
        },
        ...(isFrozen(chat)
          ? []
          : [
              {
                label: tr.chat.autoDelete(chat.autoDeleteSecs ? durationLabel(chat.autoDeleteSecs, tr) : null),
                keepOpen: true,
                onSelect: () => setView("autoDelete"),
              },
              {
                label: tr.summary.background(chat.theme ? themeName(chat.theme, tr) : tr.chat.defaultBackground),
                keepOpen: true,
                onSelect: () => setView("theme"),
              },
            ]),
        ...(chat.type !== "direct" || chat.peerDeleted
          ? []
          : chat.blockedByMe
            ? [{ label: tr.chat.unblockName(peerName), onSelect: () => void setBlocked(qc, chat, peerId, false).catch(() => null) }]
            : [{ label: tr.chat.blockName(peerName), destructive: true, keepOpen: true, onSelect: () => setView("block") }]),
        ...(chat.type !== "direct" || chat.peerDeleted
          ? []
          : [
              {
                label: tr.chat.removeContact(peerName),
                destructive: true,
                keepOpen: true,
                onSelect: () => setView("removeContact"),
              },
            ]),
        { label: tr.chat.deleteChat, destructive: true, keepOpen: true, onSelect: () => setView("delete") },
      ]}
    />
  );
}
