"use client";

import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  DELETE_RANGE_PRESETS,
  MUTE_PRESETS,
  type ChatDTO,
  type DeleteScope,
  customThemeColor,
  customThemeId,
  dayRange,
  durationLabel,
  isMuted,
  themeName,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteChat, removeContact, setBlocked, updateChatSettings } from "@/lib/actions";
import { sendAtLabel, toLocalInput } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemeDialog } from "./chat-background";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { PrimaryButton } from "./ui";

type Range = { from?: string; to?: string };

const dayInput = (d: Date) => toLocalInput(d).slice(0, 10);

export function DateRangeDialog({
  title,
  onPick,
  onClose,
}: {
  title?: string;
  onPick: (range: Range) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const today = dayInput(new Date());
  const [from, setFrom] = useState(() => dayInput(new Date(Date.now() - 7 * 864e5)));
  const [to, setTo] = useState(today);
  const fields = [
    { label: tr.chat.rangeFrom, value: from, set: setFrom },
    { label: tr.chat.rangeTo, value: to, set: setTo },
  ];
  return (
    <Dialog onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onPick(dayRange(new Date(`${from}T00:00`), new Date(`${to}T00:00`)));
        }}
        className="space-y-4 p-4"
      >
        <h2 className="text-center font-semibold">{title ?? tr.chat.deleteWhich}</h2>
        {fields.map(({ label, value, set }) => (
          <label key={label} className="block space-y-1 text-sm font-medium">
            <span>{label}</span>
            <input
              type="date"
              required
              value={value}
              max={today}
              onChange={(e) => set(e.target.value)}
              className="block w-full rounded-xl bg-stone-100 px-3 py-2.5 text-[16px] dark:bg-stone-800"
            />
          </label>
        ))}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            {tr.common.cancel}
          </button>
          <PrimaryButton type="submit" className="flex-1">
            {tr.common.next}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}

export function ChatMenu({
  chat,
  peerName,
  onClose,
  onDeleted,
  onChooseMessages,
  onSharedMedia,
}: {
  chat: ChatDTO;
  peerName: string;
  onClose: () => void;
  onDeleted?: (scope: DeleteScope) => void;
  onChooseMessages?: () => void;
  onSharedMedia?: (tab: "search" | "media") => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const [view, setView] = useState<
    | "menu"
    | "delete"
    | "deleteScope"
    | "dates"
    | "mute"
    | "autoDelete"
    | "custom"
    | "theme"
    | "customTheme"
    | "block"
    | "removeContact"
  >("menu");
  const [range, setRange] = useState<Range | undefined>(undefined);
  const meId = useSession((s) => s.user?.id);
  const peerId = chat.members.find((m) => m.user.id !== meId)?.user.id;
  const frozen = chat.blockedByMe || chat.blockedByThem || chat.peerDeleted;
  const block = (blocked: boolean) => peerId && void setBlocked(qc, chat, peerId, blocked).catch(() => null);
  const settings = (input: Parameters<typeof updateChatSettings>[2]) =>
    void updateChatSettings(qc, chat.id, input).catch(() => null);

  async function remove(scope: DeleteScope) {
    try {
      await deleteChat(qc, chat.id, scope, range);
      if (!range) onDeleted?.(scope);
    } catch {
      void qc.invalidateQueries({ queryKey: ["chats"] });
    }
  }

  async function removeFromContacts() {
    if (!peerId) return;
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

  const pick = (chosen: Range | undefined) => {
    setRange(chosen);
    setView("deleteScope");
  };

  if (view === "delete") {
    return (
      <Sheet
        title={tr.chat.deleteWhich}
        onClose={onClose}
        actions={[
          { label: tr.chat.deleteEverything, keepOpen: true, onSelect: () => pick(undefined) },
          ...DELETE_RANGE_PRESETS.map((p) => ({
            label: tr.chat[p.label],
            keepOpen: true,
            onSelect: () => pick({ from: new Date(Date.now() - p.secs * 1000).toISOString() }),
          })),
          { label: tr.chat.chooseDates, keepOpen: true, onSelect: () => setView("dates") },
          ...(onChooseMessages ? [{ label: tr.chat.chooseMessages, onSelect: onChooseMessages }] : []),
        ]}
      />
    );
  }

  if (view === "dates") return <DateRangeDialog onPick={pick} onClose={onClose} />;

  if (view === "deleteScope") {
    return (
      <Sheet
        title={range ? tr.chat.deleteRangeTitle : tr.chat.deleteChatTitle}
        onClose={onClose}
        actions={[
          { label: tr.chat.deleteForMe, destructive: true, onSelect: () => void remove("me") },
          {
            label: range ? tr.chat.deleteThisFor(peerName) : tr.chat.deleteAllFor(peerName),
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
        ...(onSharedMedia
          ? [
              { label: tr.chat.search, onSelect: () => onSharedMedia("search") },
              { label: tr.chat.sharedMedia, onSelect: () => onSharedMedia("media") },
            ]
          : []),
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
        {
          label: chat.safeView ? tr.chat.safeViewOff : tr.chat.safeViewOn,
          onSelect: () => settings({ safeView: !chat.safeView }),
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
        ...(chat.peerDeleted
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
