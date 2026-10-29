import { SixApiError, unwrap } from "@six/sdk";
import { type GifDTO, parseCommand } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

export interface CommandBarHandle {
  /** Runs the command being typed instead of sending it as text; true when there is one. */
  submit: () => boolean;
}

/** Slash commands over the composer: `/` lists them, `/giphy love` shows GIFs and `/sticker wave` stickers to send. */
export function CommandBar({
  ref,
  text,
  onComplete,
  onGif,
  onSticker,
}: {
  ref: Ref<CommandBarHandle>;
  text: string;
  onComplete: (text: string) => void;
  onGif: (gif: GifDTO) => void;
  onSticker: (sticker: GifDTO) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const command = parseCommand(text);
  const search = command?.kind === "run" ? command.args : null;
  const kind = command?.kind === "run" && command.name === "sticker" ? "sticker" : "gif";
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

  useImperativeHandle(ref, () => ({
    submit() {
      if (!command) return false;
      if (names[0]) onComplete(`/${names[0]} `);
      else if (items[0]) onPick(items[0]);
      return true;
    },
  }));

  if (!command) return null;
  if (names.length) {
    return (
      <View accessibilityLabel={tr.composer.commands} style={[styles.box, { backgroundColor: t.surface, borderColor: t.border }]}>
        {names.map((name) => (
          <Pressable key={name} onPress={() => onComplete(`/${name} `)} style={styles.command}>
            <Text style={{ color: t.text, fontWeight: "600" }}>/{name}</Text>
            <Text numberOfLines={1} style={{ color: t.muted, flex: 1 }}>
              {tr.composer.commandHints[name]}
            </Text>
          </Pressable>
        ))}
      </View>
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
  box: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  command: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  notice: { fontSize: 14, textAlign: "center", paddingVertical: 12 },
  gifs: { gap: 6 },
  gif: { height: 96, borderRadius: 8, overflow: "hidden" },
  powered: { fontSize: 11, paddingTop: 2 },
});
