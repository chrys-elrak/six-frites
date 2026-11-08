"use client";

import { unwrap } from "@six/sdk";
import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  DELETE_RANGE_PRESETS,
  MUTE_PRESETS,
  POKE_LIMITS,
  type ChatDTO,
  type DeleteScope,
  customThemeColor,
  customThemeId,
  dayRange,
  durationLabel,
  isMuted,
  themeName,
  isFrozen,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { closeSupportChat, deleteChat, setBlocked, updateChatSettings } from "@/lib/actions";
import { sendAtLabel, toLocalInput } from "@/lib/format";
import { isBotChat } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemeDialog } from "./chat-background";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { PrimaryButton, codeError } from "./ui";

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
  onGroupInfo,
  at,
  start,
  inChat,
}: {
  chat: ChatDTO;
  peerName: string;
  onClose: () => void;
  onGroupInfo?: () => void;
  onDeleted?: (scope: DeleteScope) => void;
  onChooseMessages?: () => void;
  onSharedMedia?: (tab: "search" | "media") => void;
  at?: { x: number; y: number };
  /** Opens straight on a sub-menu, like the mute durations from the header's bell. */
  start?: "mute" | "autoDelete" | "theme";
  /**
   * Opened from inside the chat: the menu holds search, media, mute, blur, auto-delete and the background, and leaves
   * pinning, archiving, blocking and deleting to the chat list's menu.
   */
  inChat?: boolean;
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
    | "poke"
  >(start ?? "menu");
  const [range, setRange] = useState<Range | undefined>(undefined);
  const meId = useSession((s) => s.user?.id);
  const peerId = chat.members.find((m) => m.user.id !== meId)?.user.id;
  const frozen = isFrozen(chat);
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

  if (view === "poke" && peerId) return <PokeDialog peerId={peerId} peerName={peerName} onClose={onClose} />;

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
          ...(chat.group && chat.group.myRole !== "owner"
            ? []
            : [
                {
                  label: range ? tr.chat.deleteThisFor(peerName) : tr.chat.deleteAllFor(peerName),
                  destructive: true,
                  onSelect: () => void remove("all"),
                },
              ]),
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
        actions={[{ label: tr.common.block, destructive: true, onSelect: () => block(true) }]}
      />
    );
  }

  if (isBotChat(chat)) {
    return (
      <Sheet
        title={chat.title}
        at={at}
        onClose={onClose}
        actions={[
          { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
          { label: chat.archived ? tr.chat.unarchive : tr.chat.archive, onSelect: () => settings({ archived: !chat.archived }) },
          { label: tr.chat.deleteChat, destructive: true, onSelect: () => void remove("me") },
        ]}
      />
    );
  }

  const mute = isMuted(chat)
    ? {
        label: chat.mutedUntil ? tr.chat.unmuteUntil(sendAtLabel(chat.mutedUntil)) : tr.common.unmute,
        onSelect: () => settings({ muted: false }),
      }
    : { label: `${tr.common.mute}…`, keepOpen: true, onSelect: () => setView("mute") };
  const closeSupport =
    chat.supportDesk && !chat.supportClosedAt
      ? [{ label: tr.support.close, onSelect: () => void closeSupportChat(qc, chat.id).catch(() => null) }]
      : [];
  const direct = chat.type === "direct" && !chat.peerDeleted;

  return (
    <Sheet
      title={chat.title}
      at={at}
      onClose={onClose}
      actions={
        inChat
          ? [
              ...(chat.group && onGroupInfo ? [{ label: tr.groups.info, onSelect: onGroupInfo }] : []),
              ...(onSharedMedia
                ? [
                    { label: tr.chat.search, onSelect: () => onSharedMedia("search") },
                    { label: tr.chat.sharedMedia, onSelect: () => onSharedMedia("media") },
                  ]
                : []),
              mute,
              ...(chat.withSupport
                ? []
                : [{ label: chat.safeView ? tr.chat.safeViewOff : tr.chat.safeViewOn, onSelect: () => settings({ safeView: !chat.safeView }) }]),
              ...(chat.withSupport || frozen
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
              ...closeSupport,
            ]
          : [
              { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
              mute,
              { label: chat.archived ? tr.chat.unarchive : tr.chat.archive, onSelect: () => settings({ archived: !chat.archived }) },
              ...closeSupport,
              ...(chat.withSupport
                ? []
                : [
                    ...(!direct || frozen ? [] : [{ label: tr.chat.poke.action, keepOpen: true, onSelect: () => setView("poke") }]),
                    ...(!direct
                      ? []
                      : chat.blockedByMe
                        ? [{ label: tr.common.unblock, onSelect: () => block(false) }]
                        : chat.blockedByThem
                          ? []
                          : [{ label: tr.common.block, destructive: true, keepOpen: true, onSelect: () => setView("block") }]),
                    { label: tr.chat.deleteChat, destructive: true, keepOpen: true, onSelect: () => setView("delete") },
                  ]),
            ]
      }
    />
  );
}

/** Asks before poking someone by email, with room for a few words, then says how many pokes are left today. */
export function PokeDialog({ peerId, peerName, onClose }: { peerId: string; peerName: string; onClose: () => void }) {
  const tr = useT();
  const t = tr.chat.poke;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  async function poke(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { message: message.trim() || undefined };
      setLeft(unwrap(await six.api.POST("/v1/users/{id}/poke", { params: { path: { id: peerId } }, body })).remaining);
    } catch (err) {
      setError(codeError(err, tr, t.errors));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      {left !== null ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="text-5xl" aria-hidden>
            👋
          </span>
          <p>{t.sent(peerName, left)}</p>
          <PrimaryButton autoFocus onClick={onClose}>
            {tr.common.done}
          </PrimaryButton>
        </div>
      ) : (
        <form onSubmit={poke} className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden>
              👋
            </span>
            <h2 className="text-lg font-semibold">{t.title(peerName)}</h2>
          </div>
          <p className="text-sm text-stone-500">{t.hint(peerName)}</p>
          <div className="relative">
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={POKE_LIMITS.message}
              rows={3}
              placeholder={t.placeholder}
              aria-label={t.placeholder}
              className="block w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[16px] outline-none focus:border-brand dark:border-stone-700 dark:bg-stone-900"
            />
            <span className="absolute right-3 bottom-2 text-xs text-stone-400">{POKE_LIMITS.message - message.length}</span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
              {tr.common.cancel}
            </button>
            <PrimaryButton type="submit" disabled={busy}>
              {t.send}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}
