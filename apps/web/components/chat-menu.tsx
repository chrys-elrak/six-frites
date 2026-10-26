"use client";

import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  MUTE_PRESETS,
  type ChatDTO,
  type DeleteScope,
  customThemeColor,
  customThemeId,
  durationLabel,
  isMuted,
  themeName,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, setBlocked, updateChatSettings } from "@/lib/actions";
import { sendAtLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
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
  const tr = useT();
  const qc = useQueryClient();
  const [view, setView] = useState<
    "menu" | "delete" | "mute" | "autoDelete" | "custom" | "theme" | "customTheme" | "block"
  >(
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
    const custom = chat.autoDeleteSecs && !(AUTO_DELETE_PRESETS as readonly number[]).includes(chat.autoDeleteSecs);
    return (
      <Sheet
        title={tr.chat.autoDeleteFor(peerName)}
        onClose={onClose}
        actions={[
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            label: `${durationLabel(secs, tr)}${chat.autoDeleteSecs === secs ? " ✓" : ""}`,
            onSelect: () => settings({ autoDeleteSecs: secs }),
          })),
          {
            label: custom ? `${tr.chat.customDuration(durationLabel(chat.autoDeleteSecs!, tr))} ✓` : tr.common.custom,
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

  if (view === "mute") {
    return (
      <Sheet
        title={tr.chat.muteFor}
        onClose={onClose}
        actions={[
          ...MUTE_PRESETS.map((p) => ({
            label: durationLabel(p.secs, tr),
            onSelect: () =>
              settings({ muted: true, mutedUntil: new Date(Date.now() + p.secs * 1000).toISOString() }),
          })),
          { label: tr.chat.muteForever, onSelect: () => settings({ muted: true, mutedUntil: null }) },
        ]}
      />
    );
  }

  if (view === "block") {
    return (
      <Sheet
        title={tr.chat.blockConfirm(peerName)}
        onClose={onClose}
        actions={[{ label: tr.chat.blockName(peerName), destructive: true, onSelect: () => block(true) }]}
      />
    );
  }

  return (
    <Sheet
      title={chat.title}
      onClose={onClose}
      actions={[
        { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
        isMuted(chat)
          ? {
              label: chat.mutedUntil ? tr.chat.unmuteUntil(sendAtLabel(chat.mutedUntil)) : tr.common.unmute,
              onSelect: () => settings({ muted: false }),
            }
          : { label: `${tr.common.mute}…`, keepOpen: true, onSelect: () => setView("mute") },
        {
          label: chat.archived ? tr.chat.unarchive : tr.chat.archive,
          onSelect: () => settings({ archived: !chat.archived }),
        },
        ...(frozen
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
        ...(chat.peerDeleted
          ? []
          : chat.blockedByMe
            ? [{ label: tr.chat.unblockName(peerName), onSelect: () => block(false) }]
            : [{ label: tr.chat.blockName(peerName), destructive: true, keepOpen: true, onSelect: () => setView("block") }]),
        { label: tr.chat.deleteChat, destructive: true, keepOpen: true, onSelect: () => setView("delete") },
      ]}
    />
  );
}
