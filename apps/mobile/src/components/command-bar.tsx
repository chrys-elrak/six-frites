import { SixApiError, unwrap } from "@six/sdk";
import {
  AUTO_DELETE_PRESETS,
  COMMANDS,
  type CommandName,
  type EmojiEntry,
  type EphemeralInput,
  type GifDTO,
  MessageEffect,
  type MenuCommand,
  durationLabel,
  isMenuCommand,
  parseCommand,
  silentMessage,
  suggestEmoji,
} from "@six/shared";
import emojis from "@six/shared/emojis.json";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { updateChatSettings } from "@/lib/actions";
import { useChat } from "@/lib/chats";
import { EPHEMERAL_OPTIONS } from "@/lib/ephemeral";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";

/** Android has no voice changer yet, so no `/voice`. */
const ANDROID_COMMANDS = COMMANDS.filter((c) => c !== "voice");
const ALL_EMOJI = (emojis as { data: EmojiEntry[] }[]).flatMap((c) => c.data);

interface Choice {
  key: string;
  label: string;
  title?: string;
  emoji?: boolean;
  current?: boolean;
  pick: () => void;
}

export interface CommandBarHandle {
  /** Runs the command being typed instead of sending it as text; true when there is one. */
  submit: () => boolean;
}

/**
 * Slash commands over the composer: `/` lists them, `/giphy love` shows GIFs and `/sticker wave` stickers
 * to send, `/effect`, `/emoji`, `/destruct`, `/location`, `/autodelete`, `/blur`, `/vanish` and `/search`
 * offer their choices inline, narrowed by what follows, and `/game` or `/schedule` opens that dialog.
 * After `/silent` it steps aside for the message to send without a notification.
 */
export function CommandBar({
  ref,
  chatId,
  text,
  onComplete,
  onGif,
  onSticker,
  onMenu,
  onDestruct,
  onLocation,
  onEffect,
  onSearch,
}: {
  ref: Ref<CommandBarHandle>;
  chatId: string;
  text: string;
  onComplete: (text: string) => void;
  onGif: (gif: GifDTO) => void;
  onSticker: (sticker: GifDTO) => void;
  onMenu: (name: MenuCommand) => void;
  onDestruct: (value: EphemeralInput) => void;
  onLocation: () => void;
  onEffect: (effect: MessageEffect) => void;
  onSearch: (q: string) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const chat = useChat(qc, chatId).data;
  const command = silentMessage(text) === null ? parseCommand(text, ANDROID_COMMANDS) : null;
  const run = command?.kind === "run" ? command : null;
  const search = run?.name === "giphy" || run?.name === "sticker" ? run.args : null;
  const kind = run?.name === "sticker" ? "sticker" : "gif";
  const onPick = kind === "sticker" ? onSticker : onGif;
  const [q, setQ] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const gifs = useQuery({
    queryKey: ["gifs", kind, q],
    queryFn: async () => unwrap(await six.api.GET("/v1/gifs", { params: { query: { q: q || undefined, kind } } })),
    enabled: search !== null && q !== null,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const names = command?.kind === "names" ? command.names : [];
  const items = search !== null ? (gifs.data?.items ?? []) : [];
  const choose = (name: CommandName) => (isMenuCommand(name) ? onMenu(name) : onComplete(`/${name} `));

  function chatSetting(input: Parameters<typeof updateChatSettings>[2]) {
    onComplete("");
    void updateChatSettings(qc, chatId, input).catch(() => null);
  }

  function choicesFor(name: CommandName, args: string): Choice[] | null {
    const q = args.toLowerCase();
    const match = (c: Choice) => c.label.toLowerCase().includes(q);
    switch (name) {
      case "emoji":
        return (q ? suggestEmoji(ALL_EMOJI, q, 16) : ALL_EMOJI.slice(0, 16)).map((x) => ({
          key: x.e,
          label: x.e,
          title: x.n,
          emoji: true,
          pick: () => onComplete(x.e),
        }));
      case "effect":
        return MessageEffect.options.map((e) => ({
          key: e,
          label: tr.messages.effectNames[e],
          pick: () => onEffect(e),
        })).filter(match);
      case "destruct":
        return EPHEMERAL_OPTIONS.map((o) => ({ key: o.label, label: o.label, pick: () => onDestruct(o.value) })).filter(
          match,
        );
      case "location":
        return [{ key: "here", label: tr.composer.sendLocation, pick: onLocation }].filter(match);
      case "autodelete":
        return [
          ...AUTO_DELETE_PRESETS.map((secs) => ({
            key: String(secs),
            label: durationLabel(secs, tr),
            current: chat?.autoDeleteSecs === secs,
            pick: () => chatSetting({ autoDeleteSecs: secs }),
          })),
          ...(chat?.autoDeleteSecs
            ? [{ key: "off", label: tr.chat.turnOff, pick: () => chatSetting({ autoDeleteSecs: null }) }]
            : []),
        ].filter(match);
      case "blur":
        return [
          {
            key: "blur",
            label: chat?.safeView ? tr.chat.safeViewOff : tr.chat.safeViewOn,
            pick: () => chatSetting({ safeView: !chat?.safeView }),
          },
        ].filter(match);
      case "vanish":
        return [
          {
            key: "vanish",
            label: chat?.vanish ? tr.composer.turnOffVanish : tr.composer.turnOnVanish,
            pick: () => chatSetting({ vanish: !chat?.vanish }),
          },
        ].filter(match);
      case "search":
        return [{ key: "search", label: args ? tr.composer.searchFor(args) : tr.chat.search, pick: () => onSearch(args) }];
      default:
        return null;
    }
  }

  const choices = run ? choicesFor(run.name, run.args) : null;

  useImperativeHandle(ref, () => ({
    submit() {
      if (!command || choices?.length === 0) return false;
      if (names[0]) choose(names[0]);
      else if (choices) choices[0]?.pick();
      else if (items[0]) onPick(items[0]);
      return true;
    },
  }));

  if (!command || choices?.length === 0) return null;
  if (names.length) {
    return (
      <ScrollView
        keyboardShouldPersistTaps="always"
        accessibilityLabel={tr.composer.commands}
        style={[styles.box, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        {names.map((name) => (
          <Pressable key={name} onPress={() => choose(name)} style={styles.command}>
            <Text style={{ color: t.text, fontWeight: "600" }}>/{name}</Text>
            <Text numberOfLines={1} style={{ color: t.muted, flex: 1 }}>
              {tr.composer.commandHints[name]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  if (choices && run) {
    return (
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={tr.composer.commandHints[run.name]}
        contentContainerStyle={styles.gifs}
      >
        {choices.map((c) => (
          <Pressable
            key={c.key}
            onPress={c.pick}
            accessibilityLabel={c.title ?? c.label}
            style={[c.emoji ? styles.emoji : styles.choice, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text
              style={
                c.emoji
                  ? styles.emojiText
                  : { color: c.current ? brand : t.text, fontSize: 14, fontWeight: c.current ? "700" : "400" }
              }
            >
              {c.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  const unavailable = gifs.error instanceof SixApiError && gifs.error.code === "GIFS_UNAVAILABLE";
  const notice = unavailable
    ? tr.composer.gifsUnavailable
    : gifs.isError
      ? kind === "sticker"
        ? tr.composer.couldNotLoadStickers
        : tr.composer.couldNotLoadGifs
      : !gifs.data
        ? tr.common.loading
        : items.length
          ? null
          : kind === "sticker"
            ? tr.composer.noStickersFound
            : tr.composer.noGifs;
  if (notice) return <Text style={[styles.notice, { color: t.muted }]}>{notice}</Text>;
  return (
    <View>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={tr.composer.pickerTabs[kind]}
        contentContainerStyle={styles.gifs}
      >
        {items.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => onPick(g)}
            accessibilityLabel={g.title}
            style={[styles.gif, { aspectRatio: g.width / g.height }, kind === "gif" && { backgroundColor: t.surface }]}
          >
            <Image
              source={{ uri: g.previewUrl }}
              style={StyleSheet.absoluteFill}
              contentFit={kind === "sticker" ? "contain" : "cover"}
            />
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[styles.powered, { color: t.faint }]}>{tr.composer.poweredByGiphy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { maxHeight: 220, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  command: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  notice: { fontSize: 14, textAlign: "center", paddingVertical: 12 },
  gifs: { gap: 6 },
  gif: { height: 96, borderRadius: 8, overflow: "hidden" },
  emoji: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 22 },
  choice: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  powered: { fontSize: 11, paddingTop: 2 },
});
