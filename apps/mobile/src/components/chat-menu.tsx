import { SixApiError, unwrap } from "@six/sdk";
import {
  AUTO_DELETE_PRESETS,
  CHAT_THEMES,
  DELETE_RANGE_PRESETS,
  POKE_LIMITS,
  type ChatDTO,
  type DeleteScope,
  customThemeColor,
  customThemeId,
  durationLabel,
  themeName,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { closeSupportChat, deleteChat, removeContact, setBlocked, updateChatSettings } from "@/lib/actions";
import { isBotChat, isFrozen } from "@/lib/chats";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Popup } from "./notes";
import { Text, TextInput } from "./text";
import { PrimaryButton } from "./ui";
import { AutoDeleteCustom } from "./auto-delete-custom";
import { CustomThemePicker } from "./custom-theme";
import { DateRangeDialog } from "./scheduled";
import { Sheet } from "./sheet";

type Range = { from?: string; to?: string };

export function ChatMenu({
  chat,
  peerName,
  peerId,
  onClose,
  onDeleted,
  onChooseMessages,
  onSharedMedia,
  muteIcon,
  onGroupInfo,
}: {
  chat: ChatDTO;
  peerName: string;
  peerId: string;
  onClose: () => void;
  onGroupInfo?: () => void;
  onDeleted?: (scope: DeleteScope) => void;
  onChooseMessages?: () => void;
  onSharedMedia?: (tab: "search" | "media") => void;
  /** The header shows mute as an icon, so the menu leaves it out. */
  muteIcon?: boolean;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const [view, setView] = useState<
    | "menu"
    | "delete"
    | "deleteScope"
    | "dates"
    | "block"
    | "autoDelete"
    | "custom"
    | "theme"
    | "customTheme"
    | "removeContact"
    | "poke"
  >("menu");
  const [range, setRange] = useState<Range | undefined>(undefined);
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
    try {
      await removeContact(qc, chat.id, peerId);
      onDeleted?.("me");
    } catch {
      void qc.invalidateQueries({ queryKey: ["chats"] });
    }
  }

  if (view === "poke") return <PokeSheet peerId={peerId} peerName={peerName} onClose={onClose} />;

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

  if (isBotChat(chat)) {
    return (
      <Sheet
        title={chat.title}
        onClose={onClose}
        actions={[
          { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
          { label: chat.archived ? tr.chat.unarchive : tr.chat.archive, onSelect: () => settings({ archived: !chat.archived }) },
          { label: tr.chat.deleteChat, destructive: true, onSelect: () => void remove("me") },
        ]}
      />
    );
  }

  return (
    <Sheet
      title={chat.title}
      onClose={onClose}
      actions={[
        ...(chat.group && onGroupInfo ? [{ label: tr.groups.info, onSelect: onGroupInfo }] : []),
        ...(onSharedMedia
          ? [
              { label: tr.chat.search, onSelect: () => onSharedMedia("search") },
              { label: tr.chat.sharedMedia, onSelect: () => onSharedMedia("media") },
            ]
          : []),
        { label: chat.pinned ? tr.chat.unpin : tr.chat.pin, onSelect: () => settings({ pinned: !chat.pinned }) },
        ...(muteIcon ? [] : [{ label: chat.muted ? tr.common.unmute : tr.common.mute, onSelect: () => settings({ muted: !chat.muted }) }]),
        {
          label: chat.archived ? tr.chat.unarchive : tr.chat.archive,
          onSelect: () => settings({ archived: !chat.archived }),
        },
        ...(chat.supportDesk && !chat.supportClosedAt
          ? [{ label: tr.support.close, onSelect: () => void closeSupportChat(qc, chat.id).catch(() => null) }]
          : []),
        ...(chat.withSupport
          ? []
          : [
              {
                label: chat.safeView ? tr.chat.safeViewOff : tr.chat.safeViewOn,
                onSelect: () => settings({ safeView: !chat.safeView }),
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
              ...(chat.type !== "direct" || chat.peerDeleted || isFrozen(chat)
                ? []
                : [{ label: tr.chat.poke.action(peerName), keepOpen: true, onSelect: () => setView("poke") }]),
              ...(chat.type !== "direct" || chat.peerDeleted
                ? []
                : chat.blockedByMe
                  ? [
                      {
                        label: tr.chat.unblockName(peerName),
                        onSelect: () => void setBlocked(qc, chat, peerId, false).catch(() => null),
                      },
                    ]
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
            ]),
      ]}
    />
  );
}

/** Asks before poking someone by email, with room for a few words, then says how many pokes are left today. */
export function PokeSheet({ peerId, peerName, onClose }: { peerId: string; peerName: string; onClose: () => void }) {
  const tr = useT();
  const th = useTheme();
  const t = tr.chat.poke;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  async function poke() {
    setBusy(true);
    setError(null);
    try {
      const body = { message: message.trim() || undefined };
      setLeft(unwrap(await six.api.POST("/v1/users/{id}/poke", { params: { path: { id: peerId } }, body })).remaining);
    } catch (err) {
      setError((err instanceof SixApiError && t.errors[err.code]) || tr.common.somethingWrongRetry);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup onClose={onClose}>
      {left !== null ? (
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 48 }}>👋</Text>
          <Text style={{ color: th.text, fontSize: 16, textAlign: "center" }}>{t.sent(peerName, left)}</Text>
          <PrimaryButton title={tr.common.done} onPress={onClose} style={{ alignSelf: "stretch" }} />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 36 }}>👋</Text>
            <Text style={{ flex: 1, color: th.text, fontSize: 18, fontWeight: "700" }}>{t.title(peerName)}</Text>
          </View>
          <Text style={{ color: th.muted, fontSize: 14 }}>{t.hint(peerName)}</Text>
          <View>
            <TextInput
              autoFocus
              multiline
              value={message}
              onChangeText={setMessage}
              maxLength={POKE_LIMITS.message}
              placeholder={t.placeholder}
              placeholderTextColor={th.muted}
              accessibilityLabel={t.placeholder}
              style={{ minHeight: 88, borderRadius: 18, padding: 14, paddingBottom: 24, fontSize: 16, textAlignVertical: "top", color: th.text, backgroundColor: th.field }}
            />
            <Text style={{ position: "absolute", right: 12, bottom: 6, fontSize: 12, color: th.muted }}>{POKE_LIMITS.message - message.length}</Text>
          </View>
          {error && <Text style={{ color: th.danger, fontSize: 14 }}>{error}</Text>}
          <PrimaryButton title={t.send} onPress={() => void poke()} disabled={busy} busy={busy} />
        </>
      )}
    </Popup>
  );
}
