import { SixApiError, unwrap } from "@six/sdk";
import {
  ASK_COLORS,
  LOCALES,
  LOCALE_NAMES,
  type AnonMessageDTO,
  type AskColors,
  type SentAnonDTO,
  ReportReason,
  type UpdateAskProfileInput,
  askUrl,
  hasLink,
  splitLinks,
} from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Camera, Ellipsis, Globe, LogOut, Share2, ShieldAlert, Trash2, VenetianMask } from "lucide-react-native";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { shareAsk, timeAgo } from "@/lib/format";
import { segments } from "@/lib/markup";
import { setLocale, useLocale, useT } from "@/lib/i18n";
import { pickAvatar } from "@/lib/media";
import { receiveAnon } from "@/lib/realtime";
import { logout, useSession } from "@/lib/session";
import { six, WEB_URL } from "@/lib/six";
import { brand, stone, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { DoodlePattern } from "./chat-background";
import { Logo } from "./logo";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";
import { Card, EmptyState, Notice, PrimaryButton, ScreenHeader, TextButton, Toggle } from "./ui";

type Pending = { m: AnonMessageDTO; action: "menu" | "delete" | "block" | "report" };
type Note = { tone: "error" | "success"; text: string };
interface CardStyle {
  colors: AskColors;
  transparent: boolean;
  doodles: boolean;
}
type Doodles = { ink: string; opacity: number; size: number };

const HEAD_DOODLES: Doodles = { ink: "#ffffff", opacity: 0.3, size: 150 };

// ponytail: font size picked from length, not measured; fine up to ASK_MAX, measure with onTextLayout if it overflows
const cardFont = (text: string) => (text.length < 60 ? 28 : text.length < 160 ? 22 : 16);

/** The name and photo people see on your link, kept apart from your account's. */
function PublicProfile({ code }: { code: string }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ["ask-profile", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/ask/{code}", { params: { path: { code } } })),
  });

  const save = useMutation({
    mutationFn: async (body: UpdateAskProfileInput) => unwrap(await six.api.PATCH("/v1/ask/profile", { body })),
    onSuccess: (p) => {
      qc.setQueryData(["ask-profile", code], p);
      setName(null);
    },
    onError: (err) => setError(err instanceof SixApiError ? err.message : tr.common.couldNotSave),
  });

  async function choosePhoto() {
    setError(null);
    try {
      const photo = await pickAvatar();
      if (photo) save.mutate({ photo });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.common.couldNotReadImage);
    }
  }

  if (!profile.data) return null;
  const dirty = name !== null && name.trim() !== profile.data.displayName;
  const saveName = () => dirty && save.mutate({ name: name.trim() });

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.profile}>
        <Pressable onPress={choosePhoto} disabled={save.isPending} accessibilityLabel={tr.settings.changePhoto}>
          <Avatar user={profile.data} size="md" />
          <View style={styles.cameraBadge}>
            <Camera size={18} color="#fff" />
          </View>
        </Pressable>
        <TextInput
          value={name ?? profile.data.displayName}
          onChangeText={setName}
          maxLength={64}
          accessibilityLabel={tr.ask.publicName}
          returnKeyType="done"
          onSubmitEditing={saveName}
          style={[styles.nameInput, { color: t.text }]}
        />
        {dirty && <TextButton title={tr.common.save} onPress={saveName} disabled={save.isPending} color={t.text} />}
      </View>
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>{tr.ask.publicHint}</Text>
      {profile.data.avatarUrl && (
        <TextButton
          title={tr.settings.removePhoto}
          onPress={() => save.mutate({ photo: null })}
          disabled={save.isPending}
          color={t.danger}
        />
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}

function Gradient({ id, colors, wash, doodles }: { id: string; colors: AskColors; wash?: boolean; doodles?: Doodles }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
        {doodles && <DoodlePattern id={`${id}-doodles`} {...doodles} />}
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
      {wash && <Rect width="100%" height="100%" fill="#ffffff" opacity={0.78} />}
      {doodles && <Rect width="100%" height="100%" fill={`url(#${id}-doodles)`} />}
    </Svg>
  );
}

/**
 * The message as an image, drawn off screen 360 wide: the card alone on a transparent background, or a
 * 9:16 story (captured at 1080×1920) with the link to send more under it.
 */
function CardArt({
  m: { text, entities, photoUrl },
  link,
  style: { colors, transparent, doodles },
  onPhotoLoad,
}: {
  m: AnonMessageDTO;
  link: string;
  style: CardStyle;
  onPhotoLoad: () => void;
}) {
  const tr = useT();
  const t = useTheme();
  const size = cardFont(text);
  const card = (
    <View style={[styles.storyCard, { backgroundColor: t.surface }]}>
      <View style={styles.cardHead}>
        <Gradient id="card-head" colors={colors} doodles={HEAD_DOODLES} />
        <Logo size={24} />
        <Text style={styles.storyPrompt} numberOfLines={1} adjustsFontSizeToFit>
          {tr.ask.prompt}
        </Text>
      </View>
      {photoUrl && (
        <Image
          source={{ uri: photoUrl }}
          style={styles.storyPhoto}
          resizeMode="cover"
          onLoad={onPhotoLoad}
          onError={onPhotoLoad}
        />
      )}
      {!!text && (
        <Text style={[styles.storyText, { color: t.text, fontSize: size, lineHeight: size * 1.25 }]}>
          <AnonText m={{ text, entities }} sealed />
        </Text>
      )}
    </View>
  );
  if (transparent) return <View style={styles.cardOnly}>{card}</View>;
  return (
    <View style={styles.story}>
      <Gradient
        id="story-bg"
        colors={colors}
        wash
        doodles={doodles ? { ink: colors[1], opacity: 0.22, size: 240 } : undefined}
      />
      {card}
      <Text style={styles.storyBrand}>Six Frites</Text>
      <Text style={styles.storyLink}>{link.replace(/^https?:\/\//, "")}</Text>
    </View>
  );
}

/**
 * A message's text as it was written, styled. Links ask before opening, and spoilers stay hidden until tapped,
 * or for good when `sealed`, as on the story image.
 */
function AnonText({
  m,
  onLink,
  sealed,
}: {
  m: Pick<AnonMessageDTO, "text" | "entities">;
  onLink?: (href: string) => void;
  sealed?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const [revealed, setRevealed] = useState(false);
  const spoilerInk = t.dark ? stone[600] : stone[300];
  return (
    <>
      {segments(m.text, m.entities).map((seg, i) => {
        const hidden = seg.styles.has("spoiler") && (sealed || !revealed);
        const style = {
          ...(seg.styles.has("bold") && { fontWeight: "900" as const }),
          ...(seg.styles.has("italic") && { fontStyle: "italic" as const }),
          ...(seg.styles.has("strike") && { textDecorationLine: "line-through" as const }),
          ...(seg.styles.has("code") && {
            fontFamily: "monospace",
            backgroundColor: t.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
          }),
          ...(hidden && { color: spoilerInk, backgroundColor: spoilerInk }),
        };
        if (hidden) {
          return (
            <Text
              key={i}
              style={style}
              accessibilityLabel={sealed ? undefined : tr.messages.revealSpoiler}
              onPress={sealed ? undefined : () => setRevealed(true)}
            >
              {seg.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={style}>
            {seg.styles.has("code") || !onLink
              ? seg.text
              : splitLinks(seg.text).map((part, j) =>
                  part.href ? (
                    <Text key={j} style={[styles.inlineLink, { color: t.read }]} onPress={() => onLink(part.href!)}>
                      {part.text}
                    </Text>
                  ) : (
                    part.text
                  ),
                )}
          </Text>
        );
      })}
    </>
  );
}

/** One message you sent, with who you sent it to. */
function SentRow({ m, onRemove }: { m: SentAnonDTO; onRemove: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar user={m.to} />
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: "600" }}>
          {tr.ask.sentTo(m.to.displayName)}
        </Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>{timeAgo(m.createdAt)}</Text>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={tr.common.remove}>
          <Trash2 size={18} color={t.muted} />
        </Pressable>
      </View>
      {m.photoUrl && (
        <Image
          source={{ uri: m.photoUrl }}
          style={{ width: "100%", height: 200, borderRadius: 12, backgroundColor: t.surfaceAlt }}
          resizeMode="contain"
        />
      )}
      {!!m.text && (
        <Text style={{ color: t.text, fontSize: 15 }} selectable>
          <AnonText m={m} />
        </Text>
      )}
    </Card>
  );
}

/** A link's preview, fetched by our server so whoever is behind the link doesn't learn who opened it. */
function LinkPreview({ url, onOpen }: { url: string; onOpen: () => void }) {
  const { data } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: async () => unwrap(await six.api.GET("/v1/link-preview", { params: { query: { url } } })),
    staleTime: Infinity,
    retry: false,
  });
  const t = useTheme();
  if (!data) return null;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.linkCard, { borderColor: t.border }, pressed && { opacity: 0.8 }]}>
      {data.image && <Image source={{ uri: data.image }} style={{ width: "100%", aspectRatio: 1.91 }} resizeMode="cover" />}
      <View style={{ padding: 10 }}>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
          {data.siteName}
        </Text>
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>
          {data.title}
        </Text>
      </View>
    </Pressable>
  );
}

/** Previews a message as an image in the color and background you pick, then shares or saves it. */
function CardExport({
  m,
  link,
  style,
  onStyle,
  onClose,
}: {
  m: AnonMessageDTO;
  link: string;
  style: CardStyle;
  onStyle: (style: CardStyle) => void;
  onClose: (note?: Note) => void;
}) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [loadedIn, setLoadedIn] = useState<boolean | null>(null);
  const shot = useRef<ComponentRef<typeof View>>(null);
  const ready = !m.photoUrl || loadedIn === style.transparent;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        captureRef(shot, {
          format: "png",
          result: "tmpfile",
          fileName: `six-frites-${m.id}${style.transparent ? "-card" : ""}`,
          ...(!style.transparent && { width: 1080, height: 1920 }),
        }).then((u) => live && setUri(u), () => null),
      ),
    );
    return () => void (live = false);
  }, [style, m.id, ready]);

  async function share() {
    if (uri) await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: tr.ask.shareStory }).catch(() => null);
    onClose();
  }

  async function save() {
    try {
      if (!uri || !(await requestPermissionsAsync(true)).granted) throw new Error("not saved");
      await Asset.create(uri);
      onClose({ tone: "success", text: tr.ask.saved });
    } catch {
      onClose({ tone: "error", text: tr.common.somethingWrongRetry });
    }
  }

  return (
    <Modal transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => onClose()}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]} onPress={() => onClose()} />
      <View ref={shot} collapsable={false} style={styles.offscreen}>
        <CardArt m={m} link={link} style={style} onPhotoLoad={() => setLoadedIn(style.transparent)} />
      </View>
      <View style={[styles.exportWrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View style={[styles.exportPanel, { backgroundColor: t.surface }]}>
          <View style={[styles.preview, { backgroundColor: t.surfaceAlt }]}>
            {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
          </View>
          <View style={styles.swatches}>
            {ASK_COLORS.map((c, i) => (
              <Pressable
                key={c.join()}
                onPress={() => onStyle({ ...style, colors: c })}
                accessibilityRole="button"
                accessibilityLabel={tr.ask.color(i + 1)}
                accessibilityState={{ selected: style.colors === c }}
                style={[styles.swatch, { borderColor: style.colors === c ? t.text : "transparent" }]}
              >
                <Svg width={32} height={32}>
                  <Defs>
                    <LinearGradient id={`swatch-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={c[0]} />
                      <Stop offset="1" stopColor={c[1]} />
                    </LinearGradient>
                  </Defs>
                  <Circle cx={16} cy={16} r={16} fill={`url(#swatch-${i})`} />
                </Svg>
              </Pressable>
            ))}
          </View>
          <Toggle
            label={tr.ask.transparent}
            hint={tr.ask.transparentHint}
            value={style.transparent}
            onChange={(transparent) => onStyle({ ...style, transparent })}
          />
          {!style.transparent && (
            <Toggle
              label={tr.ask.doodles}
              hint={tr.ask.doodlesHint}
              value={style.doodles}
              onChange={(doodles) => onStyle({ ...style, doodles })}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void save()}
              disabled={!uri}
              style={({ pressed }) => [styles.secondary, { borderColor: t.border, opacity: !uri ? 0.5 : pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: t.text, fontWeight: "600" }}>{tr.ask.saveImage}</Text>
            </Pressable>
            <PrimaryButton title={tr.common.share} onPress={() => void share()} disabled={!uri} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The Anonymous tab: your link to share, and what people sent through it. For guests it is the whole app. */
export function AnonInbox({ guest = false }: { guest?: boolean }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const code = useSession((s) => s.user!.askCode);
  const setUser = useSession((s) => s.setUser);
  const link = askUrl(WEB_URL, code);
  const [renewing, setRenewing] = useState(false);
  const [languages, setLanguages] = useState(false);
  const locale = useLocale((s) => s.locale);
  const [pending, setPending] = useState<Pending | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [exporting, setExporting] = useState<AnonMessageDTO | null>(null);
  const [cardStyle, setCardStyle] = useState<CardStyle>({ colors: ASK_COLORS[0], transparent: false, doodles: true });
  const [notice, setNotice] = useState<Note | null>(null);

  const messages = useInfiniteQuery({
    queryKey: ["ask"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/ask", { params: { query: { limit: 30, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  const items = messages.data?.pages.flatMap((p) => p.items) ?? [];
  const [view, setView] = useState<"received" | "sent">("received");
  const [removing, setRemoving] = useState<SentAnonDTO | null>(null);
  const sent = useInfiniteQuery({
    queryKey: ["ask-sent"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(await six.api.GET("/v1/ask/sent", { params: { query: { limit: 30, cursor: pageParam } } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: view === "sent",
    refetchOnMount: "always",
  });
  const sentItems = sent.data?.pages.flatMap((p) => p.items) ?? [];
  const list = view === "sent" ? sent : messages;

  useEffect(() => {
    if (!guest) return;
    const rt = six.realtime({ onEvent: () => null });
    rt.socket.on("ask:new", (m) => receiveAnon(qc, m, true));
    rt.socket.on("connect", () => void qc.invalidateQueries({ queryKey: ["ask"] }));
    rt.start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !rt.socket.connected) rt.socket.connect();
    });
    return () => {
      sub.remove();
      rt.stop();
    };
  }, [guest, qc]);

  function act(m: AnonMessageDTO, action: "delete" | "block") {
    const path = { params: { path: { id: m.id } } };
    const done =
      action === "delete"
        ? six.api.DELETE("/v1/ask/messages/{id}", path)
        : six.api.POST("/v1/ask/messages/{id}/block", path);
    void done.finally(() => qc.invalidateQueries({ queryKey: ["ask"] }));
  }

  async function renew() {
    const res = await six.api.POST("/v1/ask/code").catch(() => null);
    if (res?.data) setUser(res.data);
    else setNotice({ tone: "error", text: tr.common.somethingWrongRetry });
  }

  async function report(m: AnonMessageDTO, reason: ReportReason) {
    const res = await six.api.POST("/v1/reports", { body: { anonMessageId: m.id, reason } }).catch(() => null);
    setNotice(res?.response.ok ? { tone: "success", text: tr.chat.reportThanks } : { tone: "error", text: tr.chat.reportFailed });
  }

  const sheet = (() => {
    if (!pending) return null;
    const { m, action } = pending;
    const close = () => setPending(null);
    if (action === "menu") {
      return (
        <Sheet
          onClose={close}
          actions={[
            { label: tr.common.report, keepOpen: true, onSelect: () => setPending({ m, action: "report" }) },
            { label: tr.ask.block, destructive: true, keepOpen: true, onSelect: () => setPending({ m, action: "block" }) },
            { label: tr.common.delete, destructive: true, keepOpen: true, onSelect: () => setPending({ m, action: "delete" }) },
          ]}
        />
      );
    }
    if (action === "report") {
      return (
        <Sheet
          title={tr.ask.reportHint}
          onClose={close}
          actions={ReportReason.options.map((r) => ({
            label: tr.chat.reportReasons[r],
            onSelect: () => void report(m, r),
          }))}
        />
      );
    }
    return (
      <Sheet
        title={action === "delete" ? tr.ask.deleteConfirm : tr.ask.blockConfirm}
        onClose={close}
        actions={[
          { label: action === "delete" ? tr.common.delete : tr.ask.block, destructive: true, onSelect: () => act(m, action) },
        ]}
      />
    );
  })();

  return (
    <View style={{ flex: 1, backgroundColor: guest ? t.bg : t.glass }}>
      <ScreenHeader inset={guest}>
        {guest && <Logo size={36} />}
        <Text style={[styles.title, { color: t.text }]}>{guest ? tr.common.appName : tr.ask.title}</Text>
        {guest && (
          <Pressable
            onPress={() => setLanguages(true)}
            hitSlop={8}
            accessibilityLabel={tr.common.language}
            style={styles.language}
          >
            <Globe size={16} color={t.textSoft} />
            <Text style={{ color: t.textSoft, fontWeight: "600" }}>{LOCALE_NAMES[locale]}</Text>
          </Pressable>
        )}
        {guest && (
          <Pressable onPress={() => void logout()} hitSlop={8} accessibilityLabel={tr.settings.signOut}>
            <LogOut size={20} color={t.textSoft} />
          </Pressable>
        )}
      </ScreenHeader>
      <FlatList
        data={view === "sent" ? sentItems : items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.content}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <Card style={{ padding: 16, gap: 8 }}>
              <PublicProfile code={code} />
              <Text style={[styles.label, styles.divided, { color: t.muted, borderColor: t.border }]}>{tr.ask.yourLink}</Text>
              <Text style={{ color: t.text, fontFamily: "monospace" }} numberOfLines={1} selectable>
                {link.replace(/^https?:\/\//, "")}
              </Text>
              <Text style={{ color: t.muted, fontSize: 14 }}>{tr.ask.linkHint}</Text>
              <PrimaryButton title={tr.common.shareLink} onPress={() => void shareAsk(code)} />
              <View style={{ alignItems: "center" }}>
                <TextButton title={tr.ask.newLink} onPress={() => setRenewing(true)} />
              </View>
            </Card>
            {guest && (
              <Text style={{ color: t.muted, fontSize: 14 }}>
                {tr.ask.guestNote}{" "}
                <Text style={{ color: brand, fontWeight: "600" }} onPress={() => void Linking.openURL(`${WEB_URL}/support`)}>
                  {tr.support.chatWithSupport}
                </Text>
              </Text>
            )}
            <View style={[styles.tabs, { backgroundColor: t.chip }]}>
              {(["received", "sent"] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setView(v)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: view === v }}
                  style={[styles.tab, view === v && { backgroundColor: t.surface }]}
                >
                  <Text style={{ color: view === v ? t.text : t.muted, fontSize: 14, fontWeight: "600" }}>
                    {v === "received" ? tr.ask.received : tr.ask.sentTab}
                  </Text>
                </Pressable>
              ))}
            </View>
            {view === "received" && messages.isSuccess && !items.length && (
              <EmptyState Icon={VenetianMask}>{tr.ask.empty}</EmptyState>
            )}
            {view === "sent" && sent.isSuccess && !sentItems.length && (
              <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", paddingVertical: 32 }}>{tr.ask.sentEmpty}</Text>
            )}
          </View>
        }
        renderItem={({ item: m }) =>
          view === "sent" ? (
            <SentRow m={m as SentAnonDTO} onRemove={() => setRemoving(m as SentAnonDTO)} />
          ) : (
            <View style={[styles.item, { backgroundColor: t.surface }]}>
              <View style={styles.itemHead}>
                <Gradient id="item-head" colors={cardStyle.colors} doodles={HEAD_DOODLES} />
                <Logo size={18} />
                <Text style={styles.itemPrompt} numberOfLines={1}>
                  {tr.ask.prompt}
                </Text>
              </View>
              {m.photoUrl && <Image source={{ uri: m.photoUrl }} style={[styles.itemPhoto, { backgroundColor: t.surfaceAlt }]} resizeMode="contain" />}
              {!!m.text && (
                <Text style={[styles.itemText, { color: t.text, fontSize: cardFont(m.text), lineHeight: cardFont(m.text) * 1.3 }]} selectable>
                  <AnonText m={m} onLink={setOpening} />
                </Text>
              )}
              {splitLinks(m.text)
                .filter((p) => p.href)
                .slice(0, 1)
                .map((p) => (
                  <LinkPreview key={p.href} url={p.href!} onOpen={() => setOpening(p.href)} />
                ))}
              {hasLink(m.text) && (
                <View style={[styles.warning, { backgroundColor: t.dark ? "rgba(251,191,36,0.15)" : "#fffbeb" }]}>
                  <ShieldAlert size={16} color={t.dark ? "#fcd34d" : "#92400e"} />
                  <Text style={{ flex: 1, color: t.dark ? "#fde68a" : "#78350f", fontSize: 12, fontWeight: "500" }}>{tr.ask.linkWarning}</Text>
                </View>
              )}
              <View style={[styles.row, { borderColor: t.border }]}>
                <Text style={{ flex: 1, color: "#a8a29e", fontSize: 12 }}>
                  {timeAgo(m.createdAt)}
                  {m.oldLink && ` · ${tr.ask.oldLink}`}
                </Text>
                <Pressable
                  onPress={() => setExporting(m)}
                  style={({ pressed }) => [styles.share, { backgroundColor: t.inverse }, pressed && { opacity: 0.8 }]}
                >
                  <Share2 size={15} color={t.onInverse} />
                  <Text style={{ color: t.onInverse, fontWeight: "700", fontSize: 14 }}>{tr.common.share}</Text>
                </Pressable>
                <Pressable onPress={() => setPending({ m, action: "menu" })} hitSlop={8} accessibilityLabel={tr.ask.options}>
                  <Ellipsis size={20} color="#a8a29e" />
                </Pressable>
              </View>
            </View>
          )
        }
      />
      {removing && (
        <Sheet
          title={tr.ask.deleteSentConfirm(removing.to.displayName)}
          onClose={() => setRemoving(null)}
          actions={[
            {
              label: tr.common.remove,
              destructive: true,
              onSelect: () =>
                void six.api
                  .DELETE("/v1/ask/sent/{id}", { params: { path: { id: removing.id } } })
                  .finally(() => qc.invalidateQueries({ queryKey: ["ask-sent"] })),
            },
          ]}
        />
      )}
      {exporting && (
        <CardExport
          m={exporting}
          link={link}
          style={cardStyle}
          onStyle={setCardStyle}
          onClose={(note) => {
            setExporting(null);
            if (note) setNotice(note);
          }}
        />
      )}
      {sheet}
      {languages && (
        <Sheet
          title={tr.common.language}
          onClose={() => setLanguages(false)}
          actions={LOCALES.map((l) => ({ label: LOCALE_NAMES[l], onSelect: () => setLocale(l) }))}
        />
      )}
      {opening && (
        <Sheet
          header={
            <View style={{ gap: 4 }}>
              <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{tr.ask.openLinkConfirm}</Text>
              <Text style={{ color: t.text, fontSize: 12, fontFamily: "monospace", textAlign: "center" }}>{opening}</Text>
            </View>
          }
          onClose={() => setOpening(null)}
          actions={[{ label: tr.ask.openLink, onSelect: () => void Linking.openURL(opening) }]}
        />
      )}
      {renewing && (
        <Sheet
          title={tr.ask.newLinkConfirm}
          onClose={() => setRenewing(false)}
          actions={[{ label: tr.ask.newLink, destructive: true, onSelect: () => void renew() }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flex: 1, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4 },
  content: { padding: 16, gap: 16 },
  label: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  language: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 12 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
  profile: { flexDirection: "row", alignItems: "center", gap: 16 },
  cameraBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  nameInput: { flex: 1, fontSize: 18, fontWeight: "500", paddingVertical: 2 },
  item: { borderRadius: 24, overflow: "hidden", elevation: 4 },
  itemHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  itemPrompt: { flexShrink: 1, color: "#ffffff", fontSize: 14, fontWeight: "700" },
  tabs: { flexDirection: "row", borderRadius: 999, padding: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 999 },
  itemPhoto: { width: "100%", height: 260 },
  inlineLink: { textDecorationLine: "underline" },
  linkCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1 },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 10,
    borderRadius: 12,
  },
  storyPhoto: { width: "100%", height: 200 },
  itemText: { fontWeight: "700", textAlign: "center", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  offscreen: { position: "absolute", left: -1000, top: 0, width: 360 },
  story: { width: 360, height: 640, alignItems: "center", justifyContent: "center", padding: 30 },
  cardOnly: { width: 360 },
  storyCard: { width: "100%", borderRadius: 16, overflow: "hidden" },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  storyPrompt: { flexShrink: 1, color: "#ffffff", fontSize: 15, fontWeight: "700" },
  storyText: { fontWeight: "700", textAlign: "center", padding: 21 },
  storyBrand: { color: "#1c1917", fontSize: 16, fontWeight: "800", marginTop: 24 },
  storyLink: { color: "#57534e", fontSize: 11, marginTop: 4 },
  exportWrap: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 12 },
  exportPanel: { borderRadius: 16, padding: 12, gap: 12 },
  preview: { height: 300, borderRadius: 12, overflow: "hidden" },
  swatches: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  swatch: { borderWidth: 2, borderRadius: 999, padding: 2 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
});
