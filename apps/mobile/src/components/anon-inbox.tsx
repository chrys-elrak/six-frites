import { SixApiError, unwrap } from "@six/sdk";
import {
  ASK_COLORS,
  LOCALES,
  LOCALE_NAMES,
  type AnonMessageDTO,
  type AskColors,
  ReportReason,
  type UpdateAskProfileInput,
  askUrl,
} from "@six/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Camera, Ellipsis, Globe, LogOut, Share2, VenetianMask } from "lucide-react-native";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { shareAsk, timeAgo } from "@/lib/format";
import { setLocale, useLocale, useT } from "@/lib/i18n";
import { pickAvatar } from "@/lib/media";
import { receiveAnon } from "@/lib/realtime";
import { logout, useSession } from "@/lib/session";
import { six, WEB_URL } from "@/lib/six";
import { brand, useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { Sheet } from "./sheet";
import { Text, TextInput } from "./text";
import { Card, EmptyState, Notice, PrimaryButton, ScreenHeader, TextButton, Toggle } from "./ui";

type Pending = { m: AnonMessageDTO; action: "menu" | "delete" | "block" | "report" };
type Note = { tone: "error" | "success"; text: string };
interface CardStyle {
  colors: AskColors;
  transparent: boolean;
}

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

function Gradient({ id, colors, wash }: { id: string; colors: AskColors; wash?: boolean }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
      {wash && <Rect width="100%" height="100%" fill="#ffffff" opacity={0.78} />}
    </Svg>
  );
}

/**
 * The message as an image, drawn off screen 360 wide: the card alone on a transparent background, or a
 * 9:16 story (captured at 1080×1920) with the link to send more under it.
 */
function CardArt({ text, link, style: { colors, transparent } }: { text: string; link: string; style: CardStyle }) {
  const tr = useT();
  const size = cardFont(text);
  const card = (
    <View style={styles.storyCard}>
      <View style={styles.cardHead}>
        <Gradient id="card-head" colors={colors} />
        <Logo size={24} />
        <Text style={styles.storyPrompt} numberOfLines={1} adjustsFontSizeToFit>
          {tr.ask.prompt}
        </Text>
      </View>
      <Text style={[styles.storyText, { fontSize: size, lineHeight: size * 1.25 }]}>{text}</Text>
    </View>
  );
  if (transparent) return <View style={styles.cardOnly}>{card}</View>;
  return (
    <View style={styles.story}>
      <Gradient id="story-bg" colors={colors} wash />
      {card}
      <Text style={styles.storyBrand}>Six Frites</Text>
      <Text style={styles.storyLink}>{link.replace(/^https?:\/\//, "")}</Text>
    </View>
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
  const shot = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
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
  }, [style, m.id]);

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
        <CardArt text={m.text} link={link} style={style} />
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
  const [exporting, setExporting] = useState<AnonMessageDTO | null>(null);
  const [cardStyle, setCardStyle] = useState<CardStyle>({ colors: ASK_COLORS[0], transparent: false });
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
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.content}
        onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
        refreshing={messages.isRefetching && !messages.isFetchingNextPage}
        onRefresh={() => void messages.refetch()}
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
            {messages.isSuccess && !items.length && (
              <EmptyState Icon={VenetianMask}>{tr.ask.empty}</EmptyState>
            )}
          </View>
        }
        renderItem={({ item: m }) => (
          <View style={styles.item}>
            <View style={styles.itemHead}>
              <Gradient id="item-head" colors={cardStyle.colors} />
              <Logo size={18} />
              <Text style={styles.itemPrompt} numberOfLines={1}>
                {tr.ask.prompt}
              </Text>
            </View>
            <Text style={[styles.itemText, { fontSize: cardFont(m.text), lineHeight: cardFont(m.text) * 1.3 }]} selectable>
              {m.text}
            </Text>
            <View style={styles.row}>
              <Text style={{ flex: 1, color: "#a8a29e", fontSize: 12 }}>{timeAgo(m.createdAt)}</Text>
              <Pressable
                onPress={() => setExporting(m)}
                style={({ pressed }) => [styles.share, pressed && { opacity: 0.8 }]}
              >
                <Share2 size={15} color="#ffffff" />
                <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}>{tr.common.share}</Text>
              </Pressable>
              <Pressable onPress={() => setPending({ m, action: "menu" })} hitSlop={8} accessibilityLabel={tr.ask.options}>
                <Ellipsis size={20} color="#a8a29e" />
              </Pressable>
            </View>
          </View>
        )}
      />
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
  item: { backgroundColor: "#ffffff", borderRadius: 24, overflow: "hidden", elevation: 4 },
  itemHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  itemPrompt: { flexShrink: 1, color: "#ffffff", fontSize: 14, fontWeight: "700" },
  itemText: { color: "#1c1917", fontWeight: "700", textAlign: "center", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e7e5e4",
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1c1917",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  offscreen: { position: "absolute", left: -1000, top: 0, width: 360 },
  story: { width: 360, height: 640, alignItems: "center", justifyContent: "center", padding: 30 },
  cardOnly: { width: 360, padding: 15 },
  storyCard: { width: "100%", backgroundColor: "#ffffff", borderRadius: 16, overflow: "hidden" },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  storyPrompt: { flexShrink: 1, color: "#ffffff", fontSize: 15, fontWeight: "700" },
  storyText: { color: "#1c1917", fontWeight: "700", textAlign: "center", padding: 21 },
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
