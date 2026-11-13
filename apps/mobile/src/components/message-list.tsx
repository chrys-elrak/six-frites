import { unwrap } from "@six/sdk";
import {
  type ChatDTO,
  type ChatGame,
  type Checklist,
  type ChecklistMark,
  EPHEMERAL_RESEND,
  type GameMove,
  type GameMoveDTO,
  type GeoPoint,
  serviceSentence,
  type EphemeralDTO,
  type MessageDTO,
  type StickerDTO,
  textSize,
  type MessageEntity,
  type ReplyPreview,
  type ViewMessageResult,
  previewLink,
  splitLinks,
  type StoryReply,
  inkOn,
  isGroupAction,
  type GroupRole,
  type PublicUser,
  commentsClosedNow,
  isBotGame,
  shareTargets,
  chatTheme,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Link, router } from "expo-router";
import { Image } from "expo-image";
import { useFonts } from "expo-font";
import * as Clipboard from "expo-clipboard";
import { GestureDetector, useLongPressGesture, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { useDragSelect } from "@/lib/drag-select";
import {
  ArrowUp,
  Ban,
  Check,
  LockOpen,
  MessageCircle,
  ChevronDown,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  EyeOff,
  Flag,
  Flame,
  Forward,
  CircleFadingPlus,
  RefreshCw,
  Share2,
  StickyNote,
  Gamepad2,
  Ghost,
  Camera,
  ImagePlus,
  Info,
  KeyRound,
  Lock,
  Palette,
  Pencil,
  Phone,
  PhoneMissed,
  Pin,
  PinOff,
  Reply,
  Video,
  RotateCcw,
  Copy,
  Timer,
  Trash2,
  Image as ImageIcon,
  Users,
} from "lucide-react-native";
import { type ComponentRef, forwardRef, type ReactElement, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ListViewToken,
} from "react-native";
import { startBotGame } from "./bot-games";
import { Avatar } from "./avatar";
import { StickerView } from "./sticker";
import { Text } from "./text";
import Animated from "react-native-reanimated";
import {
  applyEdited,
  check,
  deleteMessage,
  deleteMessages,
  markOpenedLocally,
  play,
  react,
  requestReseal,
  resealMessage,
  selfDestruct,
  setCommentsClosed,
  updateChatSettings,
} from "@/lib/actions";
import { useLatest } from "@/lib/latest";
import { isAppChat, isBotChat, isFrozen, loadUntil, useMessages } from "@/lib/chats";
import { revealNow, useHydratedMessages } from "@/lib/e2ee";
import { RestoreBackupDialog, useHasRecoveryKey } from "./encryption-settings";
import { useComposerMode } from "@/lib/composer";
import { FONT_FILES, PhotoEditor } from "./photo-editor";
import { messageFile } from "@/lib/media";
import { emojiOnly, splitEmoji } from "@/lib/emoji";
import { EPHEMERAL_OPTIONS, canResend, shortRule } from "@/lib/ephemeral";
import { clockTime, dayLabel, formatDuration, sameDay } from "@/lib/format";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { segments } from "@/lib/markup";
import { six } from "@/lib/six";
import { type PendingMessage, useOutbox, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { HelloGif } from "./hello-gif";
import { deliver, forwardMessages, type LocalFile, queueMessage } from "@/lib/send";
import { useSelection } from "@/lib/selection";
import { useSpoilers } from "@/lib/spoilers";
import { useSwipe } from "@/lib/swipe";
import { brand, brandInk, flame, stone, type Theme, useTheme } from "@/lib/theme";
import { AnimatedEmoji } from "./animated-emoji";
import {
  AlbumViewer,
  AttachmentView,
  Lightbox,
  type LightboxItem,
  type ShownAttachment,
  lightboxItem,
} from "./attachment";
import { ChatPicker } from "./chat-picker";
import { StoryComposer } from "./story-composer";
import { NoteEditor } from "./notes";
import { ChecklistView } from "./checklist";
import { GameView } from "./game";
import { LocationCard } from "./location-card";
import { EphemeralViewer } from "./ephemeral-viewer";
import { MediaIcon, mediaLabel } from "./media-label";
import { MessageMenu } from "./message-menu";
import { ReactionBar, ReactionChips, ReactionPicker, type Anchor, useQuickReactions } from "./reactions";
import { GradientText, Spoiler, styleFor } from "./rich-text";
import { playHref } from "./live";
import { MessageTiming } from "./message-timing";
import { ReportSheet } from "./report-sheet";
import { Sheet, type SheetAction } from "./sheet";
import { StoryReplyLink, storyFill } from "./stories";
import { useChatLayout } from "@/lib/chat-layout";

type Delivery = "sending" | "waiting" | "failed" | "sent" | "delivered" | "read";

interface MsgRow {
  kind: "msg";
  key: string;
  id: string | null;
  message: MessageDTO | null;
  pending: PendingMessage | null;
  text: string | null;
  entities: MessageEntity[];
  spoiler: boolean;
  replyTo: ReplyPreview | null;
  story: StoryReply | null;
  bump: boolean;
  vanish: boolean;
  createdAt: string;
  mine: boolean;
  deleted: boolean;
  edited: boolean;
  attachment: ShownAttachment | null;
  sticker: StickerDTO | null;
  groupId: string | null;
  album: AlbumItem[] | null;
  location: GeoPoint | null;
  checklist: Checklist | null;
  checks: ChecklistMark[];
  game: ChatGame | null;
  moves: GameMoveDTO[];
  type: MessageDTO["type"];
  ephemeral: EphemeralDTO | null;
  locked: "decrypting" | "undecryptable" | null;
  groupStart: boolean;
  groupEnd: boolean;
  delivery: Delivery | null;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 1 };
const VANISH_PULL = 120;

interface AlbumItem {
  key: string;
  message: MessageDTO | null;
  attachment: ShownAttachment;
  spoiler: boolean;
}

const albumKinds = ["image", "video"];

/** Whether two rows are photos or videos sent together, so they show as one album. */
const sameAlbum = (a: MsgRow, b: Omit<MsgRow, "kind" | "groupStart" | "groupEnd" | "delivery">) =>
  !!a.groupId &&
  a.groupId === b.groupId &&
  a.mine === b.mine &&
  !a.deleted &&
  !b.deleted &&
  !a.ephemeral &&
  !b.ephemeral &&
  !!a.attachment &&
  !!b.attachment &&
  albumKinds.includes(a.attachment.data.kind) &&
  albumKinds.includes(b.attachment.data.kind);

const albumItem = (r: Pick<MsgRow, "key" | "message" | "attachment" | "spoiler">): AlbumItem => ({
  key: r.key,
  message: r.message,
  attachment: r.attachment!,
  spoiler: r.spoiler,
});

/** How long a direct chat stays silent before a "hello" GIF is offered again. */
const QUIET_FOR_HELLO = 3 * 86_400_000;

type Row =
  | { kind: "day"; key: string; at: string }
  | { kind: "unread"; key: string }
  | { kind: "comments"; key: string; count: number }
  | { kind: "hello"; key: string }
  | { kind: "service"; key: string; message: MessageDTO }
  | MsgRow;

interface Item {
  senderId: string;
  createdAt: string;
  row: Omit<MsgRow, "kind" | "groupStart" | "groupEnd" | "delivery">;
}

const lockOf = (m: MessageDTO & { undecryptable?: boolean; decrypting?: boolean }): MsgRow["locked"] =>
  m.deletedAt || m.type === "service" ? null : m.undecryptable ? "undecryptable" : m.decrypting ? "decrypting" : null;

/** A reply shows the message it quotes as it reads now when that one is loaded, not as it read when replied to. */
function buildRows(
  messages: MessageDTO[],
  pending: PendingMessage[],
  meId: string,
  peerDeliveredAt: number,
  peerReadAt: number,
  unreadAfter: number | null,
  vanish: boolean,
): Row[] {
  const sent = new Set(messages.filter((m) => m.senderId === meId).map((m) => m.clientId));
  const byId = new Map(messages.map((m) => [m.id, m]));
  const fresh = (r: ReplyPreview | null): ReplyPreview | null => {
    const q = r && byId.get(r.id);
    if (!r || !q) return r;
    if (q.deletedAt) return { ...r, deleted: true, text: null };
    return q.text !== null && !q.ephemeral ? { ...r, text: q.text } : r;
  };
  const items: Item[] = [
    ...messages.map((m) => ({
      senderId: m.senderId,
      createdAt: m.createdAt,
      row: {
        key: `${m.senderId}:${m.clientId}`,
        id: m.id,
        message: m,
        pending: null,
        text: m.text,
        entities: m.entities,
        spoiler: m.spoiler,
        replyTo: fresh(m.replyTo),
        story: m.story ?? null,
        bump: m.bump,
        vanish: m.vanish,
        createdAt: m.createdAt,
        mine: m.senderId === meId,
        deleted: m.deletedAt !== null,
        edited: m.editedAt !== null,
        attachment: m.attachment ? { source: "server" as const, data: m.attachment } : null,
        sticker: m.sticker ?? null,
        groupId: m.groupId ?? null,
        album: null,
        location: m.location ?? null,
        checklist: m.checklist ?? null,
        checks: m.checks ?? [],
        game: m.game ?? null,
        moves: m.moves ?? [],
        type: m.type,
        ephemeral: m.ephemeral,
        locked: lockOf(m),
      },
    })),
    ...pending
      .filter((p) => !sent.has(p.clientId))
      .map((p) => ({
        senderId: meId,
        createdAt: p.createdAt,
        row: {
          key: `${meId}:${p.clientId}`,
          id: null,
          message: null,
          pending: p,
          text: p.text,
          entities: p.entities,
          spoiler: p.spoiler,
          replyTo: fresh(p.replyTo),
          story: p.story ?? null,
          bump: p.bump ?? false,
          vanish,
          createdAt: p.createdAt,
          mine: true,
          deleted: false,
          edited: false,
          attachment: p.attachment
            ? { source: "local" as const, data: p.attachment, failed: p.status === "failed" }
            : null,
          sticker: p.sticker ?? null,
          groupId: p.groupId ?? null,
          album: null,
          location: p.location ?? null,
          checklist: p.checklist ?? null,
          checks: [],
          game: p.game ?? null,
          moves: [],
          type: (p.sticker
            ? "sticker"
            : p.location
            ? "location"
            : p.checklist
              ? "checklist"
              : p.game
                ? "game"
                : (p.attachment?.kind ?? "text")) as MessageDTO["type"],
          locked: null,
          ephemeral: p.ephemeral
            ? {
                maxViews: p.ephemeral.maxViews ?? null,
                ttlSeconds: p.ephemeral.ttlSeconds ?? null,
                views: 0,
                firstViewedAt: null,
                locked: false,
                expired: false,
                purged: false,
                resent: false,
                resendsLeft: EPHEMERAL_RESEND.max,
                resendUntil: null,
              }
            : null,
        },
      })),
  ];

  const rows: Row[] = [];
  let unreadShown = unreadAfter === null;
  items.forEach((it, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !sameDay(prev.createdAt, it.createdAt)) {
      rows.push({ kind: "day", key: `day:${it.createdAt}`, at: it.createdAt });
    }
    if (!unreadShown && it.senderId !== meId && !it.row.deleted && Date.parse(it.createdAt) > unreadAfter!) {
      unreadShown = true;
      rows.push({ kind: "unread", key: "unread" });
    }
    const r = it.row;
    if (r.message?.type === "service") {
      rows.push({ kind: "service", key: r.key, message: r.message });
      return;
    }
    const close = (a?: Item) =>
      !!a &&
      a.row.type !== "service" &&
      a.senderId === it.senderId &&
      sameDay(a.createdAt, it.createdAt) &&
      Math.abs(Date.parse(a.createdAt) - Date.parse(it.createdAt)) < 5 * 60_000;
    const last = rows[rows.length - 1];
    if (last?.kind === "msg" && sameAlbum(last, r)) {
      last.album = [...(last.album ?? [albumItem(last)]), albumItem(r)];
      if (!last.text && r.text) Object.assign(last, { text: r.text, entities: r.entities });
      last.groupEnd = !close(next);
      return;
    }
    rows.push({
      ...r,
      kind: "msg",
      groupStart: !close(prev),
      groupEnd: !close(next),
      delivery:
        !r.mine || r.deleted
          ? null
          : r.pending
            ? r.pending.status
            : Date.parse(r.createdAt) <= peerReadAt
              ? "read"
              : Date.parse(r.createdAt) <= peerDeliveredAt
                ? "delivered"
                : "sent",
    });
  });
  return rows;
}

function Ticks({ delivery, color, readColor }: { delivery: Delivery; color: string; readColor: string }) {
  const tr = useT();
  if (delivery === "sending" || delivery === "waiting") {
    return <Clock size={12} color={color} accessibilityLabel={tr.messages.status.sending} />;
  }
  if (delivery === "failed") return null;
  const label = tr.messages.status[delivery];
  const Icon = delivery === "sent" ? Check : CheckCheck;
  return <Icon size={14} strokeWidth={2.5} color={delivery === "read" ? readColor : color} accessibilityLabel={label} />;
}

function Meta({ row, color, t }: { row: MsgRow; color: string; t: Theme }) {
  const tr = useT();
  const bubble = useBubbleColors();
  const onPill = color === "#fff";
  const readColor = !row.mine ? t.read : onPill ? "#7dd3fc" : bubble.ink;
  return (
    <>
      {row.edited && !row.deleted && <Text style={[styles.meta, { color }]}>{tr.messages.edited}</Text>}
      <Text style={[styles.meta, { color }]}>{clockTime(row.createdAt)}</Text>
      {row.delivery && <Ticks delivery={row.delivery} color={color} readColor={readColor} />}
    </>
  );
}

/** The story a message answers: a small copy of it, under who answered and how. */
function StoryQuote({ story, mine, color, reaction }: { story: StoryReply; mine: boolean; color: string; reaction: boolean }) {
  const t = useT().stories;
  const [broken, setBroken] = useState(false);
  const picture = story.imageUrl && !broken ? story.imageUrl : null;
  if (story.kind === "note") {
    return (
      <View style={[styles.storyQuote, { alignItems: "flex-start" }]}>
        <Text style={{ color, fontSize: 12, opacity: 0.75 }}>{mine ? t.youRepliedToNote : t.repliedToNote}</Text>
        <View style={{ maxWidth: "100%", borderRadius: 16, backgroundColor: story.background ?? "rgba(0,0,0,0.1)", paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text numberOfLines={4} style={{ color: story.background ? inkOn(story.background) : color, fontSize: 14 }}>
            {story.text ?? t.gif}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.storyQuote}>
      <Text style={{ color, fontSize: 12, opacity: 0.75 }}>
        {mine ? (reaction ? t.youReacted : t.youReplied) : reaction ? t.reactedToYours : t.repliedToYours}
      </Text>
      <View style={[styles.storyThumb, story.kind === "text" ? storyFill(story.background ?? "#eb8a00") : { backgroundColor: "#292524" }]}>
        {story.kind === "text" ? (
          <Text numberOfLines={6} style={styles.storyThumbText}>
            {story.text}
          </Text>
        ) : picture ? (
          <>
            <Image source={{ uri: picture }} onError={() => setBroken(true)} style={StyleSheet.absoluteFill} contentFit="cover" />
            {story.kind === "video" && (
              <View style={styles.storyPlay}>
                <Video size={16} color="#fff" />
              </View>
            )}
          </>
        ) : (
          <>
            {story.kind === "video" ? <Video size={20} color="#fff" /> : <ImageIcon size={20} color="#fff" />}
            <Text style={styles.storyThumbText}>{story.kind === "video" ? t.video : t.photo}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function Quote({
  reply,
  name,
  mine,
  onPress,
  earlier = false,
}: {
  reply: ReplyPreview;
  name: string;
  mine: boolean;
  onPress: () => void;
  /** Quotes a message from before I joined the group: its text stays hidden, and there's nothing to jump to. */
  earlier?: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const dim = reply.deleted || reply.spoiler || earlier;
  return (
    <Pressable
      onPress={earlier ? undefined : onPress}
      style={[
        styles.quote,
        mine
          ? { borderLeftColor: alpha(bubble.ink, 0.4), backgroundColor: "rgba(0,0,0,0.1)" }
          : {
              borderLeftColor: brand,
              backgroundColor: bubble.theirInk ? alpha(bubble.theirInk, 0.08) : t.dark ? "rgba(68,64,60,0.6)" : stone[100],
            },
      ]}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: 13 }}>{name}</Text>
      <View style={styles.quoteBody}>
        {reply.deleted || earlier ? null : reply.ephemeral ? (
          <Flame size={13} color={fg} />
        ) : reply.spoiler ? (
          <EyeOff size={13} color={fg} />
        ) : reply.type !== "text" ? (
          <MediaIcon type={reply.type} color={fg} size={13} />
        ) : null}
        <Text numberOfLines={2} style={{ color: fg, fontSize: 13, opacity: dim ? 0.7 : 0.8, fontStyle: dim ? "italic" : "normal", flexShrink: 1 }}>
          {earlier
            ? tr.messages.beforeYouJoined
            : reply.deleted
            ? tr.summary.messageDeleted
            : reply.ephemeral
              ? tr.summary.selfDestructing
              : reply.spoiler
              ? tr.summary.spoiler
              : reply.type !== "text"
                ? `${mediaLabel(reply.type, tr)}${reply.text ? ` · ${reply.text}` : ""}`
                : reply.text}
        </Text>
      </View>
    </Pressable>
  );
}

function MessageText({ row, selecting, color }: { row: MsgRow; selecting: boolean; color: string }) {
  const tr = useT();
  const revealed = useSpoilers((s) => !!s.revealed[row.key]);
  const reveal = useSpoilers((s) => s.reveal);
  const text = row.text ?? "";
  const entities =
    row.spoiler && !row.attachment
      ? [...row.entities, { type: "spoiler" as const, offset: 0, length: text.length }]
      : row.entities;
  if (entities.length === 0) return <Linked text={text} selecting={selecting} />;
  const codeBg = row.mine ? "rgba(0,0,0,0.1)" : "rgba(120,113,108,0.18)";

  return (
    <>
      {segments(text, entities).map((seg, i) => {
        const style = styleFor(seg, codeBg);
        if (!seg.styles.has("spoiler") || revealed) {
          return (
            <Text key={i} style={style}>
              {GradientText({ seg }) ?? (seg.styles.has("code") ? seg.text : <Linked text={seg.text} selecting={selecting} size={seg.size} />)}
            </Text>
          );
        }
        return (
          <Spoiler
            key={i}
            text={seg.text}
            style={style}
            font={styles.text}
            ink={color}
            label={tr.messages.revealSpoiler}
            onPress={selecting ? undefined : () => reveal(row.key)}
          />
        );
      })}
    </>
  );
}

/** Text with its links and animated emoji; the emoji grow with the text's size when it has one. */
export function Linked({ text, selecting, size, onOpen }: { text: string; selecting: boolean; size?: string; onOpen?: () => void }) {
  const emoji = Math.round((textSize(size) ?? 16) * 1.25);
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <Text
            key={i}
            onPress={
              selecting
                ? undefined
                : () => {
                    onOpen?.();
                    void Linking.openURL(part.href!);
                  }
            }
            style={{ textDecorationLine: "underline" }}
          >
            {part.text}
          </Text>
        ) : (
          splitEmoji(part.text).map((s, j) => (j % 2 ? <AnimatedEmoji key={`${i}:${j}`} emoji={s} size={emoji} inline /> : s))
        ),
      )}
    </>
  );
}

export function LinkCard({ url, mine, width, onOpen }: { url: string; mine: boolean; width: number; onOpen?: () => void }) {
  const t = useTheme();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const { data } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: async () => unwrap(await six.api.GET("/v1/link-preview", { params: { query: { url } } })),
    staleTime: Infinity,
    retry: false,
  });
  if (!data) return null;
  return (
    <Pressable
      onPress={() => {
        onOpen?.();
        void Linking.openURL(url);
      }}
      style={[
        styles.quote,
        styles.linkCard,
        { width },
        mine
          ? { borderLeftColor: alpha(bubble.ink, 0.4), backgroundColor: "rgba(0,0,0,0.1)" }
          : {
              borderLeftColor: brand,
              backgroundColor: bubble.theirInk ? alpha(bubble.theirInk, 0.08) : t.dark ? "rgba(68,64,60,0.6)" : stone[100],
            },
      ]}
    >
      {data.image && <Image source={{ uri: data.image }} style={styles.linkImage} contentFit="cover" />}
      <View style={styles.linkBody}>
        <Text numberOfLines={1} style={{ color: fg, fontSize: 13, opacity: 0.7 }}>
          {data.siteName}
        </Text>
        <Text numberOfLines={2} style={{ color: fg, fontSize: 13, fontWeight: "700" }}>
          {data.title}
        </Text>
        {data.description && (
          <Text numberOfLines={3} style={{ color: fg, fontSize: 13, opacity: 0.8 }}>
            {data.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Sealed({ row, color, onOpen }: { row: MsgRow; color: string; onOpen: () => void }) {
  const t = useTheme();
  const tr = useT();
  const e = row.ephemeral!;
  const tint = row.mine ? color : flame;
  const kind = row.type === "text" ? tr.common.message : mediaLabel(row.type, tr);
  return (
    <Pressable onPress={onOpen} disabled={e.expired} style={styles.sealed}>
      <View
        style={[
          styles.sealedIcon,
          { backgroundColor: e.expired ? "rgba(120,113,108,0.15)" : row.mine ? "rgba(0,0,0,0.1)" : "rgba(249,115,22,0.15)" },
        ]}
      >
        <Flame size={20} color={e.expired ? t.muted : tint} fill={e.expired ? "none" : tint} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color, fontWeight: "700", fontSize: 15 }}>{e.expired ? tr.messages.opened : tr.messages.tapToView}</Text>
        <Text style={{ color, opacity: 0.7, fontSize: 12 }}>
          {kind} · {shortRule(e, tr)}
          {e.resent && ` · ${tr.messages.resent}`}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Converts the server's expiry time into this device's clock using the response's Date header, so a
 * phone whose clock is off still counts down the real time left. Never longer than the message's timer.
 */
function toLocalDeadline(result: ViewMessageResult, response: Response) {
  if (!result.expiresAt) return null;
  const serverNow = Date.parse(response.headers.get("date") ?? "");
  const skew = Number.isNaN(serverNow) ? 0 : serverNow - Date.now();
  const ttl = result.message.ephemeral?.ttlSeconds;
  const local = Date.parse(result.expiresAt) - skew;
  return new Date(ttl ? Math.min(local, Date.now() + ttl * 1000) : local).toISOString();
}

function SenderBadge({ e, color, onResend }: { e: EphemeralDTO; color: string; onResend: () => void }) {
  const tr = useT();
  return (
    <View style={styles.badge}>
      <Flame size={12} color={color} />
      <Text style={{ color, fontSize: 11, opacity: 0.8 }}>
        {shortRule(e, tr)} ·{" "}
        {e.expired || e.views
          ? e.views > 1
            ? tr.messages.openedTimes(e.views)
            : tr.messages.opened
          : tr.messages.notOpened}
      </Text>
      {canResend(e) && (
        <Pressable onPress={onResend} hitSlop={6} style={styles.resend}>
          <RotateCcw size={12} color={color} />
          <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{tr.messages.resendLeft(e.resendsLeft)}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** An album as one grid: two per row up to four, three per row after that, the leftovers made wider on top. */
function AlbumGrid({
  items,
  mine,
  width,
  hidden,
  chip,
  onReveal,
  onOpen,
}: {
  items: AlbumItem[];
  mine: boolean;
  width: number;
  hidden: (item: AlbumItem) => boolean;
  chip: (item: AlbumItem) => string | undefined;
  onReveal: (key: string) => void;
  onOpen: (index: number) => void;
}) {
  const perRow = items.length <= 4 ? 2 : 3;
  const extra = items.length % perRow;
  const gap = 2;
  return (
    <View style={{ width, flexDirection: "row", flexWrap: "wrap", gap, borderRadius: 12, overflow: "hidden" }}>
      {items.map((it, i) => {
        const inRow = extra && i < extra ? extra : perRow;
        const side = Math.floor((width - gap * (inRow - 1)) / inRow);
        return (
          <View key={it.key} style={{ width: side, height: inRow === 1 ? Math.floor(width / 2) : side }}>
            <AttachmentView
              attachment={it.attachment}
              mine={mine}
              tile
              maxWidth={side}
              onOpen={() => onOpen(i)}
              hidden={hidden(it)}
              hiddenLabel={chip(it)}
              onReveal={() => onReveal(it.key)}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Under an encrypted message someone couldn't open: they can restore it from their backup or ask for it
 * again, and once they have asked, the sender's devices offer to encrypt it again for everyone's devices.
 */
function ResealPrompt({
  message,
  mine,
  locked,
  meId,
  t,
}: {
  message: MessageDTO;
  mine: boolean;
  locked: boolean;
  meId: string;
  t: Theme;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const hasKey = useHasRecoveryKey();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const reseal = message.encryption?.reseal ?? null;
  const restorable = locked && !!message.encryption?.backup && hasKey.data === false;
  const askedOfMe = mine && !!reseal && reseal.by !== meId;
  const canResend = askedOfMe && !restorable && (reseal.state === "requested" || !locked);
  const canAsk = locked && !reseal;
  const note = askedOfMe
    ? reseal.state === "failed" && locked
      ? tr.messages.resendFailedMine
      : tr.messages.resendRequested
    : !locked || !reseal
      ? null
      : reseal.state === "failed"
        ? tr.messages.resendFailed
        : tr.messages.resendAsked;
  if (!note && !restorable && !canResend && !canAsk) return null;

  async function run() {
    setBusy(true);
    try {
      await (canResend ? resealMessage(qc, message) : requestReseal(qc, message));
    } catch {
      void qc.invalidateQueries({ queryKey: ["messages", message.chatId] });
    } finally {
      setBusy(false);
    }
  }

  const label = { color: brand, fontSize: 12, fontWeight: "600" } as const;
  const action = { flexDirection: "row", alignItems: "center", gap: 4 } as const;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        alignSelf: "stretch",
        justifyContent: mine ? "flex-end" : "flex-start",
        columnGap: 8,
        rowGap: 2,
        marginTop: 2,
        paddingHorizontal: 6,
      }}
    >
      {note && <Text style={{ color: t.muted, fontSize: 12 }}>{note}</Text>}
      {restorable && (
        <Pressable onPress={() => setRestoring(true)} hitSlop={6} style={action}>
          <KeyRound size={14} color={brand} />
          <Text style={label}>{tr.messages.restoreFromBackup}</Text>
        </Pressable>
      )}
      {(canResend || canAsk) && (
        <Pressable onPress={() => void run()} disabled={busy} hitSlop={6} style={[action, { opacity: busy ? 0.5 : 1 }]}>
          <RotateCcw size={14} color={brand} />
          <Text style={label}>{canResend ? tr.messages.resendEncrypted : tr.messages.askResend}</Text>
        </Pressable>
      )}
      {restoring && <RestoreBackupDialog onClose={() => setRestoring(false)} />}
    </View>
  );
}

function Bubble({
  row,
  highlighted,
  selecting,
  selected,
  nameOf,
  maxWidth,
  onMenu,
  onReply,
  onQuote,
  onToggle,
  pick,
  onOpen,
  onOpenEphemeral,
  onResend,
  meId,
  onReact,
  onCheck,
  onPlay,
  onSendGame,
  onOpenAlbum,
  safe,
  frozen,
  gamesOnly = false,
  autoPlay,
  onVoiceStop,
  sender,
  comments,
  onOpenThread,
  quoteEarlier,
}: {
  row: MsgRow;
  /** In a group, who sent an incoming message: their name heads a run of their messages, their picture ends it. */
  sender?: Pick<PublicUser, "displayName" | "avatarUrl" | "alias"> & { role?: GroupRole | null };
  highlighted: boolean;
  selecting: boolean;
  selected: boolean;
  nameOf: (userId: string) => string;
  maxWidth: number;
  onMenu: (anchor?: Anchor) => void;
  onReply: () => void;
  onQuote: (id: string) => void;
  onToggle: () => void;
  /** Picking a run of messages by long-pressing one and sliding. */
  pick: { attach: (id: string | null, node: ComponentRef<typeof View> | null) => void; start: () => void; move: (y: number) => void; end: () => void };
  onOpen: (item: LightboxItem) => void;
  onOpenEphemeral: () => void;
  onResend: () => void;
  meId: string;
  onReact: (emoji: string) => void;
  onCheck: (item: number) => void;
  onPlay: (move: GameMove) => void;
  onSendGame: (game: ChatGame) => void;
  onOpenAlbum: (items: ShownAttachment[], start: number) => void;
  /** Safe view is on: their photos and videos stay blurred until tapped. */
  safe: boolean;
  frozen: boolean;
  /** In a chat with Six Frites Game or Six Frites News: just the games or news, no menu, reactions or replies. */
  gamesOnly?: boolean;
  autoPlay: boolean;
  onVoiceStop: (finished: boolean) => void;
  /** A group message's comments, for the link under it; null where there's none to show. */
  comments?: MessageDTO["thread"];
  onOpenThread?: () => void;
  quoteEarlier?: boolean;
}) {
  const compact = useChatLayout((s) => s.layout === "compact");
  const right = row.mine && !compact;
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const selectable = selecting && row.message !== null;
  const revealedMedia = useSpoilers((s) => s.revealed);
  const blurred = (key: string, spoiler: boolean, safeToo = true) => (spoiler || (safe && safeToo)) && !revealedMedia[key];
  const chip = (spoiler: boolean) => (spoiler ? undefined : tr.messages.tapToShow);
  const revealMedia = useSpoilers((s) => s.reveal);
  const { mine, groupStart, groupEnd } = row;
  const e = row.ephemeral;
  const sealed = !!e && (mine || e.locked || e.expired);
  const jumbo =
    !row.deleted && !row.ephemeral && !row.attachment && !row.spoiler && !row.replyTo && !row.story && row.entities.length === 0 && row.text
      ? emojiOnly(row.text)
      : null;
  const visual = !sealed && row.attachment && (row.attachment.data.kind === "image" || row.attachment.data.kind === "video");
  const note = !sealed && row.attachment?.data.kind === "video_note" && !row.deleted;
  const hasText = !!row.text || row.deleted || !!row.locked;
  const deletedBy = row.message?.deletedBy;
  const deletedText =
    deletedBy === meId && !row.mine
      ? tr.messages.youDeleted(nameOf(row.message!.senderId))
      : deletedBy && deletedBy !== meId && row.mine
        ? tr.messages.deletedYours(nameOf(deletedBy))
        : deletedBy && deletedBy !== meId
          ? tr.messages.deletedBy(nameOf(deletedBy))
          : tr.messages.deleted;
  const inlineVoice =
    !sealed &&
    !hasText &&
    row.attachment?.data.kind === "voice" &&
    !(row.attachment.source === "server" && row.attachment.data.status === "removed");
  const link =
    !sealed && !row.deleted && !row.locked && !row.attachment && !row.spoiler && row.text
      ? previewLink(row.text, row.entities)
      : null;
  const big = 18;
  const small = 6;
  const radius = right
    ? {
        borderTopLeftRadius: big,
        borderBottomLeftRadius: big,
        borderTopRightRadius: groupStart ? big : small,
        borderBottomRightRadius: groupEnd ? big : small,
      }
    : {
        borderTopRightRadius: big,
        borderBottomRightRadius: big,
        borderTopLeftRadius: groupStart ? big : small,
        borderBottomLeftRadius: groupEnd ? big : small,
      };
  const loose = !sealed && !row.deleted && !!(row.message as { file?: { sticker?: boolean } } | null)?.file?.sticker;
  const sticker = !sealed && !row.deleted ? row.sticker : null;
  const bare = jumbo || note || loose || sticker;
  const tone = bare
    ? null
    : row.deleted
      ? { borderWidth: 1, borderColor: t.dark ? stone[700] : stone[300] }
      : mine
        ? { backgroundColor: bubble.bg }
        : {
            backgroundColor: bubble.theirBg ?? t.bubbleIn,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.dark ? stone[700] : stone[200],
          };
  const theirInk = bubble.theirInk ?? t.text;
  const fg = row.deleted ? t.muted : bare ? t.text : mine ? bubble.ink : theirInk;
  const metaColor =
    row.deleted || bare ? t.muted : mine ? alpha(bubble.ink, 0.7) : bubble.theirInk ? alpha(theirInk, 0.6) : t.muted;

  const bubbleRef = useRef<ComponentRef<typeof View>>(null);
  const canReact = !frozen && !gamesOnly && !!row.message && !row.pending && !row.deleted && row.type !== "service" && !row.ephemeral?.purged;
  const favorite = useQuickReactions()[0]!;
  const latest = useLatest({ selectable, selecting, canReact, onToggle, onMenu, onReact, pick, favorite });
  const openMenu = () => {
    const node = bubbleRef.current;
    if (!node) return latest.current.onMenu();
    node.measureInWindow((x, y, width, height) => latest.current.onMenu({ x, y, width, height }));
  };
  const hold = useLongPressGesture({
    enabled: !selectable && !gamesOnly,
    minDuration: 350,
    runOnJS: true,
    onActivate: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (latest.current.selectable) return latest.current.onToggle();
      openMenu();
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    runOnJS: true,
    onActivate: () => {
      const l = latest.current;
      if (!l.canReact || l.selecting) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      l.onReact(l.favorite);
    },
  });
  const swipe = useSwipe(
    !selecting && !frozen && !gamesOnly && row.message && !row.pending && !row.deleted ? onReply : null,
    right ? -1 : 1,
  );
  const slide = usePanGesture({
    enabled: selectable,
    activateAfterLongPress: 350,
    runOnJS: true,
    onActivate: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      latest.current.pick.start();
    },
    onUpdate: (e) => latest.current.pick.move(e.absoluteY),
    onFinalize: () => latest.current.pick.end(),
  });
  const gestures = useSimultaneousGestures(hold, doubleTap, swipe.gesture, slide);
  const pickId = row.message ? row.id : null;
  const attach = (node: ComponentRef<typeof View> | null) => pick.attach(pickId, node);

  return (
    <GestureDetector gesture={gestures}>
    <Pressable
      ref={attach}
      onPress={selectable ? onToggle : undefined}
      style={[
        styles.line,
        { paddingBottom: groupEnd ? 10 : 2 },
        selected && { backgroundColor: "rgba(235,138,0,0.12)" },
      ]}
    >
      {selecting &&
        (row.message ? (
          selected ? (
            <CheckCircle2 size={20} color={t.bg} fill={brand} />
          ) : (
            <Circle size={20} color={t.faint} />
          )
        ) : (
          <View style={{ width: 20 }} />
        ))}
      <Animated.View pointerEvents="none" style={[styles.swipeHint, right ? { right: 12 } : { left: 12 }, swipe.hint]}>
        <View style={styles.swipeIcon}>
          <Reply size={16} color="#fff" />
        </View>
      </Animated.View>
      {sender && (
        <View style={{ width: 36, alignSelf: compact ? "flex-start" : "flex-end" }}>
          {(compact ? groupStart : groupEnd) && <Avatar user={sender} />}
        </View>
      )}
      <Animated.View style={[styles.side, { alignItems: right ? "flex-end" : "flex-start" }, swipe.moving]}>
        {sender && groupStart && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2, marginHorizontal: compact ? 0 : 12 }}>
            <Text style={{ color: bubble.bg, fontSize: compact ? 14 : 12, fontWeight: "700" }}>{sender.displayName}</Text>
            {sender.role && sender.role !== "member" && (
              <Text style={styles.roleBadge}>{sender.role === "owner" ? tr.groups.owner : tr.groups.admin}</Text>
            )}
          </View>
        )}
        <View
          ref={bubbleRef}
          collapsable={false}
          pointerEvents={selectable ? "none" : "auto"}
          style={[
            radius,
            tone,
            row.vanish &&
              !row.deleted &&
              !bare && { borderWidth: 1.5, borderStyle: "dashed", borderColor: mine ? alpha(bubble.ink, 0.4) : alpha(theirInk, 0.3) },
            { maxWidth, overflow: "hidden" },
            !bare && (visual ? styles.padVisual : styles.padText),
            row.delivery === "failed" && { opacity: 0.6 },
            highlighted && { borderWidth: 3, borderColor: "rgba(56,189,248,0.6)" },
          ]}
        >
          {row.bump && !row.deleted && (
            <View style={styles.bumped}>
              <ArrowUp size={14} color={fg} />
              <Text style={{ color: fg, fontSize: 12, fontWeight: "600", opacity: 0.8 }}>{tr.messages.bumped}</Text>
            </View>
          )}
          {row.replyTo && !row.deleted && (
            <Quote
              reply={row.replyTo}
              mine={mine && !bare}
              name={nameOf(row.replyTo.senderId)}
              onPress={() => onQuote(row.replyTo!.id)}
              earlier={quoteEarlier}
            />
          )}
          {row.story && !row.deleted && (
            <StoryReplyLink id={row.story.id} note={row.story.kind === "note"}>
              <StoryQuote story={row.story} mine={mine} color={fg} reaction={!!row.text && !!emojiOnly(row.text)} />
            </StoryReplyLink>
          )}
          {e && mine && !e.purged && !row.deleted && <SenderBadge e={e} color={fg} onResend={onResend} />}
          {sticker && <StickerView sticker={sticker} size={160} />}
          {row.album && !row.deleted && !sealed ? (
            <AlbumGrid
              items={row.album}
              mine={mine}
              width={Math.min(280, maxWidth - 8)}
              hidden={(it) => blurred(it.key, it.spoiler)}
              chip={(it) => chip(it.spoiler)}
              onReveal={revealMedia}
              onOpen={(i) => onOpenAlbum(row.album!.map((it) => it.attachment), i)}
            />
          ) : (
            row.attachment &&
            !row.deleted &&
            !sealed && (
              <AttachmentView
                attachment={row.attachment}
                mine={mine}
                onOpen={loose ? () => {} : onOpen}
                hidden={(["image", "video", "gif"].includes(row.attachment.data.kind) || (note && row.spoiler)) && blurred(row.key, row.spoiler, !loose && row.attachment.data.kind !== "gif")}
                hiddenLabel={chip(row.spoiler)}
                onReveal={() => revealMedia(row.key)}
                maxWidth={maxWidth - 8}
                autoPlay={autoPlay}
                onStop={onVoiceStop}
                track={
                  row.message
                    ? { chatId: row.message.chatId, title: mine ? tr.common.you : nameOf(row.message.senderId) }
                    : undefined
                }
                meta={
                  inlineVoice && (
                    <View style={[styles.metaRow, { paddingTop: 0 }]}>
                      <Meta row={row} color={metaColor} t={t} />
                    </View>
                  )
                }
              />
            )
          )}
          {link && <LinkCard url={link} mine={mine} width={Math.min(280, maxWidth - 24)} />}
          {row.location && !row.deleted && !sealed && <LocationCard point={row.location} mine={mine} />}
          {row.checklist && !row.deleted && (
            <ChecklistView
              list={row.checklist}
              checks={row.checks}
              mine={mine}
              nameOf={nameOf}
              onCheck={row.message && !frozen && !selecting ? onCheck : undefined}
            />
          )}
          {row.game && !row.deleted && (
            <GameView
              game={row.game}
              senderId={row.message?.senderId ?? meId}
              moves={row.moves}
              meId={meId}
              mine={mine}
              nameOf={nameOf}
              onPlay={row.message && !frozen && !selecting ? onPlay : undefined}
              onSend={!frozen && !selecting ? onSendGame : undefined}
              quick={gamesOnly}
            />
          )}
          {sealed ? (
            <View style={styles.sealedRow}>
              <Sealed row={row} color={fg} onOpen={onOpenEphemeral} />
              <View style={[styles.sealedMeta]}>
                <Meta row={row} color={metaColor} t={t} />
              </View>
            </View>
          ) : jumbo ? (
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row" }}>
                {jumbo.map((e, i) => (
                  <AnimatedEmoji key={`${e}:${i}`} emoji={e} size={jumbo.length === 1 ? 112 : 80} />
                ))}
              </View>
              <View style={styles.jumboMeta}>
                <Meta row={row} color="#fff" t={t} />
              </View>
            </View>
          ) : (sticker || loose) && !hasText ? (
            <View pointerEvents="none" style={[styles.jumboMeta, styles.stickerMeta]}>
              <Meta row={row} color="#fff" t={t} />
            </View>
          ) : note ? (
            <View style={[styles.jumboMeta, { alignSelf: right ? "flex-end" : "flex-start", marginTop: 4 }]}>
              <Meta row={row} color="#fff" t={t} />
            </View>
          ) : inlineVoice ? null : (
            <View style={[styles.textRow, visual && (hasText ? styles.caption : styles.mediaMeta)]}>
              {row.deleted ? (
                <View style={styles.deleted}>
                  <Ban size={14} color={fg} />
                  <Text style={[styles.text, { color: fg, fontStyle: "italic" }]}>{deletedText}</Text>
                </View>
              ) : row.locked ? (
                <View style={styles.deleted}>
                  <Lock size={14} color={fg} />
                  <Text style={[styles.text, { color: fg, fontStyle: "italic", flexShrink: 1 }]}>
                    {row.locked === "decrypting" ? tr.messages.decrypting : tr.messages.cantDecrypt}
                  </Text>
                </View>
              ) : (
                hasText && (
                  <Text style={[styles.text, { color: fg, flexShrink: 1 }]}>
                    <MessageText row={row} selecting={selecting} color={fg} />
                  </Text>
                )
              )}
              <View style={styles.metaRow}>
                <Meta row={row} color={metaColor} t={t} />
              </View>
            </View>
          )}
        </View>
        {row.message && !row.deleted && (
          <ReactionChips
            reactions={row.message.reactions ?? []}
            meId={meId}
            mine={right}
            nameOf={nameOf}
            onReact={frozen ? () => {} : onReact}
          />
        )}
        {comments && !row.deleted && (comments.count > 0 || commentsClosedNow(comments)) && (
          <Pressable onPress={onOpenThread} hitSlop={6} style={styles.commentsLink}>
            {commentsClosedNow(comments) ? <Lock size={14} color={brand} /> : <MessageCircle size={14} color={brand} />}
            <Text style={{ color: brand, fontSize: 12, fontWeight: "700" }}>
              {comments.count > 0 ? tr.groups.comments(comments.count) : tr.groups.commentsClosed}
            </Text>
          </Pressable>
        )}
        {row.message && !row.deleted && (
          <ResealPrompt message={row.message} mine={mine} locked={row.locked === "undecryptable"} meId={meId} t={t} />
        )}
        {row.delivery === "waiting" && (
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{tr.chats.waitingForNetwork}</Text>
        )}
        {row.delivery === "failed" && (
          <Pressable onPress={openMenu} hitSlop={6}>
            <Text style={{ color: t.danger, fontSize: 12, fontWeight: "600", marginTop: 2 }}>{tr.messages.notSent}</Text>
          </Pressable>
        )}
      </Animated.View>
    </Pressable>
    </GestureDetector>
  );
}

export interface MessageListHandle {
  scrollToBottom: () => void;
  /** Loads the history down to this message if needed, then scrolls to it and highlights it. */
  jumpTo: (messageId: string) => void;
}

function OlderLoader() {
  const bubble = useBubbleColors();
  return (
    <View style={styles.older}>
      <View style={[styles.olderDot, { backgroundColor: bubble.bg }]}>
        <ActivityIndicator size="small" color={bubble.ink} />
      </View>
    </View>
  );
}

export const MessageList = forwardRef<
  MessageListHandle,
  {
    chat: ChatDTO;
    meId: string;
    onSeen: () => void;
    /** Shows the comments on this group message, with the message itself on top, instead of the chat. */
    threadId?: string;
    onOpenThread?: (m: MessageDTO) => void;
    /** Shown right under the newest message, like the typing bubble. */
    after?: ReactElement;
  }
>(
  function MessageList({ chat, meId, onSeen, threadId, onOpenThread, after }, handle) {
    useFonts(FONT_FILES);
    const t = useTheme();
    const tr = useT();
    const qc = useQueryClient();
    const { width } = useWindowDimensions();
    const { realtime } = useRealtime();
    const messages = useMessages(chat.id, threadId);
    const main = useMessages(chat.id);
    const pending = usePending(chat.id, threadId);
    const slot = threadId ? `${chat.id}:${threadId}` : chat.id;
    const groupAdmin = !!chat.group && chat.group.myRole !== "member";
    const hiddenBefore = chat.group && chat.hiddenBefore ? Date.parse(chat.hiddenBefore) : null;
    useEffect(() => () => useSpoilers.getState().forget(), [chat.id]);
    const setMode = useComposerMode((s) => s.set);
    const selecting = useSelection((s) => !threadId && s.chatId === chat.id);
    const frozen = isFrozen(chat);
    const selectedIds = useSelection((s) => s.ids);
    const startSelection = useSelection((s) => s.start);
    const toggleSelected = useSelection((s) => s.toggle);
    const list = useRef<FlatList<Row>>(null);
    const listFrame = useRef<ComponentRef<typeof View>>(null);
    const pickOrder = useRef<string[]>([]);
    const picker = useDragSelect(list, listFrame, () => pickOrder.current);
    const [autoplay, setAutoplay] = useState<string | null>(null);
    const atBottom = useRef(true);
    const [away, setAway] = useState(false);
    const offset = useRef(0);
    const pullFrom = useRef<number | null>(null);
    const [pulled, setPulled] = useState(0);
    const [confirmVanish, setConfirmVanish] = useState(false);
    const [menuFor, setMenuFor] = useState<MsgRow | null>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO[] | null>(null);
    const [sharing, setSharing] = useState<{ text: string; message: MessageDTO } | null>(null);
    const [noting, setNoting] = useState<{ text: string; message: MessageDTO } | null>(null);
    const look = chatTheme(chat.theme).light;
    const quoteOf = (msg: MessageDTO) => {
      const from = chat.members.find((x) => x.user.id === msg.senderId)?.user;
      return from && { from, sentAt: msg.createdAt, messageId: msg.id };
    };
    const [forwarding, setForwarding] = useState<MessageDTO[] | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
    const [album, setAlbum] = useState<{ items: LightboxItem[]; start: number } | null>(null);
    const [destructFor, setDestructFor] = useState<MessageDTO | null>(null);
    const [timingFor, setTimingFor] = useState<string | null>(null);
    const [reporting, setReporting] = useState<string | null>(null);
    const [markingUp, setMarkingUp] = useState<{ message: MessageDTO; file: LocalFile } | null>(null);
    const [reactingTo, setReactingTo] = useState<MessageDTO | null>(null);
    const [viewing, setViewing] = useState<ViewMessageResult | null>(null);
    const [opening, setOpening] = useState(false);
    const viewingRef = useRef(viewing);
    useLayoutEffect(() => {
      viewingRef.current = viewing;
    }, [viewing]);
    const closeViewer = useCallback(() => {
      const shown = viewingRef.current;
      if (!shown) return;
      viewingRef.current = null;
      setViewing(null);
      if (shown.message.senderId === meId) return;
      const id = shown.message.id;
      const e = shown.message.ephemeral;
      const endsAt = shown.expiresAt ? Date.parse(shown.expiresAt) : null;
      const viewsUsed = !!e?.maxViews && e.views >= e.maxViews;
      if (viewsUsed || (endsAt !== null && Date.now() >= endsAt - 250)) markOpenedLocally(qc, chat.id, id);
      else if (endsAt !== null) setTimeout(() => markOpenedLocally(qc, chat.id, id), endsAt - Date.now());
    }, [qc, chat.id, meId]);

    async function resendEphemeral(m: MessageDTO) {
      try {
        applyEdited(qc, unwrap(await six.api.POST("/v1/messages/{id}/resend", { params: { path: { id: m.id } } })));
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      }
    }

    async function openEphemeral(row: MsgRow) {
      const id = row.id;
      if (!id || selecting) return;
      setOpening(true);
      try {
        if (row.mine && row.message) return setViewing({ message: await revealNow(meId, row.message), expiresAt: null });
        const res = await six.api.POST("/v1/messages/{id}/view", { params: { path: { id } } });
        const result = unwrap(res);
        const message = await revealNow(meId, result.message);
        setViewing({ message, expiresAt: toLocalDeadline(result, res.response) });
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      } finally {
        setOpening(false);
      }
    }

    const names = useMemo(() => new Map(chat.members.map((m) => [m.user.id, m.user.displayName])), [chat.members]);
    const nameOf = (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? (chat.group ? tr.groups.formerMember : tr.common.someone)));
    const compact = useChatLayout((s) => s.layout === "compact");
    const senderOf = (row: MsgRow) => {
      const id = row.message?.senderId ?? (row.mine ? meId : null);
      if (!id || (!compact && (!chat.group || row.mine))) return undefined;
      if (id === meId) return { displayName: tr.common.you, avatarUrl: null };
      const member = chat.members.find((m) => m.user.id === id);
      return member ? { ...member.user, role: chat.group ? member.role : null } : { displayName: tr.groups.formerMember, avatarUrl: null };
    };

    const { peerDeliveredAt, peerReadAt } = useMemo(() => {
      const peers = chat.members.filter((m) => m.user.id !== meId);
      const earliest = (pick: (m: (typeof peers)[number]) => string | null) =>
        peers.length ? Math.min(...peers.map((m) => (pick(m) ? Date.parse(pick(m)!) : 0))) : 0;
      return { peerDeliveredAt: earliest((m) => m.lastDeliveredAt), peerReadAt: earliest((m) => m.lastReadAt) };
    }, [chat.members, meId]);
    const [unreadAfter] = useState(() => {
      if (threadId) return null;
      if (!chat.unreadCount) return null;
      const read = chat.members.find((m) => m.user.id === meId)?.lastReadAt;
      return read ? Date.parse(read) : 0;
    });

    const root = threadId ? main.data?.pages.flatMap((p) => p.items).find((m) => m.id === threadId) : undefined;
    const loaded = useMemo(
      () => [...(messages.data?.pages.flatMap((p) => p.items) ?? []), ...(root ? [root] : [])],
      [messages.data, root],
    );
    const { shown, see } = useHydratedMessages(meId, loaded);
    const seeRef = useLatest(see);
    const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ListViewToken[] }) =>
      seeRef.current(
        viewableItems.flatMap(({ item }: { item: Row }) =>
          item.kind === "msg" ? (item.id ? [item.id] : []) : item.kind === "service" ? [item.message.id] : [],
        ),
      ),
    );
    const ordered = useMemo(() => shown.slice().reverse(), [shown]);
    const rows = useMemo(() => {
      const built = buildRows(ordered, pending, meId, peerDeliveredAt, peerReadAt, unreadAfter, chat.vanish).reverse();
      const at = root ? built.findIndex((r) => r.kind === "msg" && r.id === root.id) : -1;
      if (at >= 0) built.splice(at, 0, { kind: "comments", key: "comments", count: root!.thread?.count ?? 0 });
      const quiet = chat.type === "direct" && !chat.withSupport && !pending.length && ordered.length > 0 && Date.now() - Date.parse(ordered[ordered.length - 1]!.createdAt) > QUIET_FOR_HELLO;
      if (quiet && !root) built.unshift({ kind: "hello", key: "hello" });
      return built;
    }, [ordered, pending, meId, peerDeliveredAt, peerReadAt, unreadAfter, chat.vanish, chat.type, chat.withSupport, root]);
    useEffect(() => {
      pickOrder.current = rows.flatMap((r) => (r.kind === "msg" && r.message && r.id ? [r.id] : []));
    }, [rows]);
    const scrollToBottom = () => list.current?.scrollToOffset({ offset: 0, animated: true });

    /** After a voice message plays to the end, starts the next one if it's a voice message too. Rows run newest first. */
    function playNext(key: string) {
      const from = rows.findIndex((r) => r.key === key);
      const index = rows.findLastIndex((r, i) => i < from && r.kind !== "day" && r.kind !== "unread");
      const next = rows[index];
      const voice =
        next?.kind === "msg" &&
        next.attachment?.source === "server" &&
        next.attachment.data.kind === "voice" &&
        !next.deleted &&
        !next.ephemeral;
      if (from < 0 || !voice) return setAutoplay(null);
      setAutoplay(next.key);
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    }
    const [jumping, setJumping] = useState<string | null>(null);
    useImperativeHandle(handle, () => ({
      scrollToBottom,
      jumpTo: (id) => {
        setJumping(id);
        void loadUntil(qc, chat.id, id).then((found) => !found && setJumping(null));
      },
    }));

    useEffect(() => {
      if (atBottom.current) onSeen();
    }, [chat.lastMessage?.id, onSeen]);

    useEffect(() => {
      if (!highlight) return;
      const timer = setTimeout(() => setHighlight(null), 1200);
      return () => clearTimeout(timer);
    }, [highlight]);

    function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
      offset.current = e.nativeEvent.contentOffset.y;
      picker.onScroll(e.nativeEvent.contentOffset.y);
      const wasAtBottom = atBottom.current;
      atBottom.current = e.nativeEvent.contentOffset.y < 80;
      if (atBottom.current && !wasAtBottom) onSeen();
      setAway(e.nativeEvent.contentOffset.y > e.nativeEvent.layoutMeasurement.height);
    }

    /** Pulling up past the latest message asks to turn vanish mode on or off, like Instagram. */
    function pullStart(e: GestureResponderEvent) {
      const end = offset.current <= 1;
      pullFrom.current = chat.type === "direct" && !isBotChat(chat) && !frozen && !threadId && !selecting && end ? e.nativeEvent.pageY : null;
    }

    function pullMove(e: GestureResponderEvent) {
      if (pullFrom.current === null) return;
      const next = Math.max(0, pullFrom.current - e.nativeEvent.pageY);
      if (next >= VANISH_PULL && pulled < VANISH_PULL) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPulled(next);
    }

    function pullEnd() {
      if (pulled >= VANISH_PULL) setConfirmVanish(true);
      pullFrom.current = null;
      setPulled(0);
    }

    function rowIndex(id: string) {
      return rows.findIndex((r) => r.kind === "msg" && (r.id === id || !!r.album?.some((it) => it.message?.id === id)));
    }

    const [jump, setJump] = useState<{ index: number } | null>(null);
    const jumpIndex = jumping ? rowIndex(jumping) : -1;
    if (jumping && jumpIndex >= 0) {
      setJumping(null);
      setHighlight(jumping);
      setJump({ index: jumpIndex });
    }
    useEffect(() => {
      if (jump) list.current?.scrollToIndex({ index: jump.index, viewPosition: 0.5, animated: false });
    }, [jump]);

    function jumpTo(id: string) {
      const index = rowIndex(id);
      if (index < 0) return;
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlight(id);
    }

    const reactable = (row: MsgRow) =>
      !!row.message && !row.pending && !row.deleted && row.type !== "service" && !row.ephemeral?.purged;

    function reactionBar(row: MsgRow) {
      const m = row.message!;
      const own = (m.reactions ?? []).filter((r) => r.userIds.includes(meId)).map((r) => r.emoji);
      return (
        <ReactionBar
          mine={own}
          onPick={(emoji) => {
            setMenuFor(null);
            void react(qc, m, meId, emoji);
          }}
          onMore={() => {
            setMenuFor(null);
            setReactingTo(m);
          }}
        />
      );
    }

    function actionsFor(row: MsgRow): SheetAction[] {
      if (row.pending) {
        const p = row.pending;
        return [
          ...(p.status === "failed" && realtime
            ? [{ label: tr.common.retry, icon: RotateCcw, onSelect: () => void deliver(qc, realtime, p) }]
            : []),
          ...(p.text ? [{ label: tr.common.copy, icon: Copy, onSelect: () => void Clipboard.setStringAsync(p.text) }] : []),
          { label: tr.messages.discard, icon: Trash2, destructive: true, onSelect: () => useOutbox.getState().remove(p.chatId, p.clientId) },
        ];
      }
      const m = row.message!;
      const photo =
        !frozen &&
        !m.ephemeral &&
        !row.album &&
        m.type === "image" &&
        m.attachment?.status === "ready" &&
        m.attachment.mime !== "image/gif";
      if (row.deleted) {
        return [
          ...(threadId ? [] : [{ label: tr.common.select, icon: CheckCircle2, onSelect: () => startSelection(chat.id, m.id) }]),
          ...(chat.type === "direct" || row.mine
            ? [
                {
                  label: chat.type === "direct" ? tr.messages.removeForMeAnd(chat.title) : tr.messages.removeForEveryone,
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void deleteMessage(qc, m, "all").catch(() => null),
                },
              ]
            : []),
          { label: tr.messages.removeForMe, icon: Trash2, destructive: true, onSelect: () => void deleteMessage(qc, m, "me").catch(() => null) },
        ];
      }
      return [
        ...(!threadId && chat.group && onOpenThread && m.thread && !m.ephemeral && (m.thread.count > 0 || !commentsClosedNow(m.thread))
          ? [{ label: m.thread.count ? tr.groups.viewComments : tr.groups.comment, icon: MessageCircle, onSelect: () => onOpenThread(m) }]
          : []),
        ...(!threadId && groupAdmin && m.thread
          ? [
              {
                label: commentsClosedNow(m.thread) ? tr.groups.reopenComments : tr.groups.closeComments,
                icon: commentsClosedNow(m.thread) ? LockOpen : Lock,
                onSelect: () => void setCommentsClosed(m.id, { closed: !m.thread!.closed }).catch(() => null),
              },
            ]
          : []),
        ...(frozen ? [] : [{ label: tr.messages.reply, icon: Reply, onSelect: () => setMode(slot, { kind: "reply", message: m }) }]),
        ...(frozen || m.ephemeral || m.bump || m.type === "service" || !realtime
          ? []
          : [
              {
                label: tr.messages.bump,
                icon: ArrowUp,
                onSelect: () => void queueMessage(qc, realtime, chat.id, { text: "", replyTo: m, bump: true }),
              },
            ]),
        ...(m.ephemeral ||
        row.locked ||
        ["service", "game", "gif", "sticker"].includes(m.type) ||
        (m.attachment && m.attachment.status !== "ready")
          ? []
          : [
              {
                label: tr.messages.forward,
                icon: Forward,
                onSelect: () => setForwarding(row.album?.flatMap((it) => (it.message ? [it.message] : [])) ?? [m]),
              },
            ]),
        ...(m.type !== "text" || m.ephemeral || row.locked || !shareTargets(m.text).story
          ? []
          : [{ label: tr.messages.shareToStory, icon: CircleFadingPlus, onSelect: () => setSharing({ text: shareTargets(m.text).text, message: m }) }]),
        ...(m.type !== "text" || m.ephemeral || row.locked || !shareTargets(m.text).note
          ? []
          : [{ label: tr.messages.setAsNote, icon: StickyNote, onSelect: () => setNoting({ text: shareTargets(m.text).text, message: m }) }]),
        ...(threadId ? [] : [{ label: tr.common.select, icon: CheckCircle2, onSelect: () => startSelection(chat.id, m.id) }]),
        ...(frozen || m.ephemeral || m.type === "service"
          ? []
          : [
              {
                label: chat.pinnedMessages.some((p) => p.id === m.id) ? tr.messages.unpin : tr.messages.pin,
                icon: chat.pinnedMessages.some((p) => p.id === m.id) ? PinOff : Pin,
                onSelect: () =>
                  void updateChatSettings(
                    qc,
                    chat.id,
                    chat.pinnedMessages.some((p) => p.id === m.id) ? { unpin: m.id } : { pin: m.id },
                  ).catch(() => null),
              },
            ]),
        ...(m.ephemeral || frozen
          ? []
          : [
              ...(row.mine && (m.text !== null || photo)
                ? [
                    {
                      label: tr.common.edit,
                      icon: Pencil,
                      onSelect: () =>
                        photo
                          ? void messageFile(m).then(
                              (file) => setMarkingUp({ message: m, file }),
                              () => setMode(slot, { kind: "edit", message: m }),
                            )
                          : setMode(slot, { kind: "edit", message: m }),
                    },
                  ]
                : []),
            ]),
        ...(photo && !row.mine
          ? [
              {
                label: tr.messages.markUpAndReply,
                icon: ImagePlus,
                onSelect: () =>
                  void messageFile(m).then(
                    (file) => {
                      setMode(slot, { kind: "reply", message: m });
                      useComposerMode.getState().hand(chat.id, file);
                    },
                    () => null,
                  ),
              },
            ]
          : []),
        ...(m.ephemeral && canResend(m.ephemeral)
          ? [{ label: tr.messages.resendAgain, icon: RotateCcw, onSelect: () => void resendEphemeral(m) }]
          : []),
        ...(!m.ephemeral && row.mine && !frozen && !["sticker", "checklist", "game"].includes(m.type)
          ? [{ label: tr.messages.makeSelfDestruct, icon: Flame, onSelect: () => setDestructFor(m) }]
          : []),
        { label: tr.messages.timing, icon: Info, onSelect: () => setTimingFor(m.id) },
        ...(row.mine || m.type === "service" ? [] : [{ label: tr.common.report, icon: Flag, onSelect: () => setReporting(m.id) }]),
        {
          label: tr.common.delete,
          icon: Trash2,
          destructive: true,
          onSelect: () => setConfirmDelete(row.album?.flatMap((it) => (it.message ? [it.message] : [])) ?? [m]),
        },
      ];
    }

    if (messages.isPending) {
      return (
        <View style={styles.center}>
          <Text style={{ color: t.muted }}>{tr.common.loading}</Text>
        </View>
      );
    }

    const maxWidth = compact ? width - 80 - (selecting ? 28 : 0) : Math.round(width * (selecting ? 0.72 : 0.8));

    return (
      <View
        ref={listFrame}
        style={{ flex: 1 }}
        onTouchStart={pullStart}
        onTouchMove={pullMove}
        onTouchEnd={pullEnd}
        onTouchCancel={pullEnd}
      >
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.onWallpaper, styles.emptyChip]}>
              {chat.withSupport ? tr.support.welcome : tr.messages.empty}
            </Text>
            {!chat.withSupport && <HelloGif chatId={chat.id} />}
          </View>
        ) : (
          <FlatList
            ref={list}
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            onScroll={onScroll}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={VIEWABILITY}
            scrollEventThrottle={64}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
            ListFooterComponent={messages.isFetchingNextPage ? <OlderLoader /> : undefined}
            ListHeaderComponent={after}
            onScrollToIndexFailed={(info) => {
              list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
              setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 }), 100);
            }}
            contentContainerStyle={{ paddingVertical: 8 }}
            extraData={[selecting, selectedIds, highlight, autoplay]}
            renderItem={({ item: row }) =>
              row.kind === "day" ? (
                <View style={styles.day}>
                  <Text style={[styles.dayText, styles.onWallpaper]}>{dayLabel(row.at)}</Text>
                </View>
              ) : row.kind === "comments" ? (
                <View style={styles.commentsDivider}>
                  <View style={styles.commentsLine} />
                  <View style={[styles.serviceChip, styles.onWallpaper]}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                      {row.count ? tr.groups.comments(row.count) : tr.groups.noComments}
                    </Text>
                  </View>
                  <View style={styles.commentsLine} />
                </View>
              ) : row.kind === "hello" ? (
                <View style={{ alignItems: "center", paddingBottom: 12 }}>
                  <HelloGif chatId={chat.id} />
                </View>
              ) : row.kind === "unread" ? (
                <View style={styles.service}>
                  <View style={[styles.serviceChip, styles.onWallpaper]}>
                    <Text style={{ color: "#fff", fontSize: 12 }}>{tr.messages.unread}</Text>
                  </View>
                </View>
              ) : row.kind === "service" ? (
                <View style={styles.service}>
                  <View style={[styles.serviceChip, styles.onWallpaper]}>
                    {row.message.action?.type === "theme" ? (
                      <Palette size={14} color="#fff" />
                    ) : row.message.action?.type === "e2ee" ? (
                      <Lock size={14} color="#fff" />
                    ) : row.message.action?.type === "vanish" ? (
                      <Ghost size={14} color="#fff" />
                    ) : row.message.action?.type === "screenshot" ? (
                      <Camera size={14} color="#fff" />
                    ) : row.message.action?.type === "resend_request" ? (
                      <RefreshCw size={14} color="#fff" />
                    ) : row.message.action?.type === "shared_to" ? (
                      <Share2 size={14} color="#fff" />
                    ) : row.message.action?.type === "call" ? (
                      row.message.action.secs === null ? (
                        <PhoneMissed size={14} color="#fff" />
                      ) : row.message.action.video ? (
                        <Video size={14} color="#fff" />
                      ) : (
                        <Phone size={14} color="#fff" />
                      )
                    ) : row.message.action?.type === "live_invite" || row.message.action?.type === "live_result" ? (
                      <Gamepad2 size={14} color="#fff" />
                    ) : isGroupAction(row.message.action) ? (
                      <Users size={14} color="#fff" />
                    ) : (
                      <Timer size={14} color="#fff" />
                    )}
                    <Text style={{ color: "#fff", fontSize: 12, textAlign: "center", flexShrink: 1 }}>
                      {row.message.action?.type === "e2ee"
                        ? tr.messages.e2eeNotice
                        : row.message.action?.type === "call"
                          ? tr.messages.callLog(
                              row.message.action.video,
                              row.message.senderId === meId,
                              row.message.action.secs === null ? null : formatDuration(row.message.action.secs * 1000),
                            )
                          : serviceSentence(
                              row.message,
                              row.message.senderId === meId ? null : nameOf(row.message.senderId),
                              tr,
                            )}
                    </Text>
                    {row.message.action?.type === "live_invite" && !row.message.action.ended && (
                      <Link
                        href={playHref(row.message.action.roomId)}
                        style={{ color: "#fff", fontSize: 12, fontWeight: "700", textDecorationLine: "underline" }}
                      >
                        {tr.live.join}
                      </Link>
                    )}
                  </View>
                </View>
              ) : (
                <Bubble
                  row={row}
                  sender={senderOf(row)}
                  highlighted={row.id !== null && row.id === highlight}
                  selecting={selecting}
                  selected={row.id !== null && selecting && selectedIds.includes(row.id)}
                  nameOf={nameOf}
                  maxWidth={maxWidth}
                  onMenu={(at) => {
                    setAnchor(at ?? null);
                    setMenuFor(row);
                  }}
                  onReply={() => row.message && setMode(slot, { kind: "reply", message: row.message })}
                  onQuote={jumpTo}
                  onToggle={() => row.id && toggleSelected(row.id)}
                  pick={{
                    attach: picker.register,
                    start: () => row.id && picker.start(row.id),
                    move: picker.move,
                    end: picker.end,
                  }}
                  onOpen={setLightbox}
                  onOpenEphemeral={() => void openEphemeral(row)}
                  onResend={() => row.message && void resendEphemeral(row.message)}
                  meId={meId}
                  onReact={(emoji) => row.message && void react(qc, row.message, meId, emoji)}
                  onCheck={(item) => row.message && void check(qc, row.message, meId, item)}
                  onPlay={(move) => row.message && void play(qc, row.message, meId, move)}
                  onSendGame={(game) =>
                    isBotChat(chat) && isBotGame(game.game)
                      ? startBotGame(qc, game.game)
                      : realtime && queueMessage(qc, realtime, chat.id, { text: "", game })
                  }
                  onOpenAlbum={(items, start) => {
                    const shown = items.map(lightboxItem);
                    if (!shown[start]) return;
                    const ready = shown.filter((x) => x !== null);
                    setAlbum({ items: ready, start: ready.indexOf(shown[start]!) });
                  }}
                  safe={chat.safeView}
                  frozen={frozen}
                  gamesOnly={isAppChat(chat)}
                  autoPlay={autoplay === row.key}
                  onVoiceStop={(finished) =>
                    finished ? playNext(row.key) : setAutoplay((k) => (k === row.key ? null : k))
                  }
                  comments={!threadId && chat.group ? (row.message?.thread ?? null) : null}
                  onOpenThread={() => row.message && onOpenThread?.(row.message)}
                  quoteEarlier={!!row.replyTo && hiddenBefore !== null && Date.parse(row.replyTo.sentAt) <= hiddenBefore}
                />
              )
            }
          />
        )}

        {menuFor &&
          (anchor ? (
            <MessageMenu anchor={anchor} mine={menuFor.mine} actions={actionsFor(menuFor)} onClose={() => setMenuFor(null)}>
              {!frozen && reactable(menuFor) && reactionBar(menuFor)}
            </MessageMenu>
          ) : (
            <Sheet actions={actionsFor(menuFor)} onClose={() => setMenuFor(null)} />
          ))}
        <ReactionPicker
          open={reactingTo !== null}
          onClose={() => setReactingTo(null)}
          onPick={(emoji, media) => {
            if (reactingTo) void react(qc, reactingTo, meId, emoji, media);
            setReactingTo(null);
          }}
        />
        {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
        {album && <AlbumViewer items={album.items} start={album.start} onClose={() => setAlbum(null)} />}
        {timingFor && <MessageTiming messageId={timingFor} onClose={() => setTimingFor(null)} />}
        {reporting && <ReportSheet target={{ messageId: reporting }} onClose={() => setReporting(null)} />}
        {markingUp && (
          <PhotoEditor
            file={markingUp.file}
            onCancel={() => {
              setMode(slot, { kind: "edit", message: markingUp.message });
              setMarkingUp(null);
            }}
            onDone={(file) => {
              setMode(slot, { kind: "edit", message: markingUp.message, photo: file });
              setMarkingUp(null);
            }}
          />
        )}
        {noting && (
          <NoteEditor
            note={null}
            fromMessage={{ text: noting.text, messageId: noting.message.id, quote: quoteOf(noting.message) ?? null }}
            onClose={() => setNoting(null)}
          />
        )}
        {sharing && <StoryComposer initialText={sharing.text} bubble={`${look.bubble},${look.bubbleInk}`} quote={quoteOf(sharing.message)} onClose={() => setSharing(null)} />}
        {forwarding && (
          <ChatPicker
            title={tr.messages.forwardTo}
            empty={tr.chats.noChats}
            onClose={() => setForwarding(null)}
            onPick={(to) => {
              setForwarding(null);
              if (!realtime) return;
              void forwardMessages(qc, realtime, to.id, forwarding).catch(() => null);
              if (to.id !== chat.id) router.push(`/chats/${to.id}`);
            }}
          />
        )}
        {destructFor && (
          <Sheet
            title={tr.messages.selfDestructTitle}
            onClose={() => setDestructFor(null)}
            actions={EPHEMERAL_OPTIONS.map((o) => ({
              label: o.label,
              onSelect: () => void selfDestruct(qc, destructFor, o.value),
            }))}
          />
        )}
        {(viewing || opening) && (
          <EphemeralViewer
            message={viewing?.message ?? null}
            expiresAt={viewing?.expiresAt ?? null}
            mine={viewing?.message.senderId === meId}
            onClose={closeViewer}
          />
        )}
        {confirmVanish && (
          <Sheet
            title={tr.composer.vanishBanner}
            onClose={() => setConfirmVanish(false)}
            actions={[
              {
                label: chat.vanish ? tr.composer.turnOffVanish : tr.composer.turnOnVanish,
                onSelect: () => void updateChatSettings(qc, chat.id, { vanish: !chat.vanish }).catch(() => null),
              },
            ]}
          />
        )}
        {confirmDelete && (
          <Sheet
            title={tr.messages.deleteTitle}
            onClose={() => setConfirmDelete(null)}
            actions={[
              ...(chat.type === "direct" || confirmDelete[0]!.senderId === meId
                ? [
                    {
                      label: chat.type === "direct" ? tr.messages.deleteForMeAnd(chat.title) : tr.messages.deleteForEveryone,
                      destructive: true,
                      onSelect: () => void deleteMessages(qc, chat.id, confirmDelete, "all").catch(() => null),
                    },
                  ]
                : []),
              {
                label: tr.messages.deleteForMe,
                destructive: true,
                onSelect: () => void deleteMessages(qc, chat.id, confirmDelete, "me").catch(() => null),
              },
            ]}
          />
        )}
        {pulled > 0 && (
          <View pointerEvents="none" style={[styles.vanishPull, { opacity: Math.min(1, pulled / VANISH_PULL) }]}>
            <View style={[styles.vanishChip, pulled >= VANISH_PULL ? { backgroundColor: brand } : styles.onWallpaper]}>
              <Ghost size={16} color={pulled >= VANISH_PULL ? brandInk : "#fff"} />
              <Text style={{ color: pulled >= VANISH_PULL ? brandInk : "#fff", fontSize: 14, fontWeight: "700" }}>
                {chat.vanish ? tr.composer.turnOffVanish : tr.composer.turnOnVanish}
              </Text>
            </View>
          </View>
        )}
        {away && (
          <Pressable
            onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
            accessibilityLabel={tr.messages.latest}
            style={[styles.latest, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <ChevronDown size={24} color={t.textSoft} />
            {chat.unreadCount > 0 && (
              <View style={[styles.latestBadge, { backgroundColor: brand }]}>
                <Text style={{ color: brandInk, fontSize: 12, fontWeight: "700" }}>{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  commentsDivider: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  commentsLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.25)" },
  commentsLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 2 },
  roleBadge: {
    color: brand,
    backgroundColor: "rgba(235,138,0,0.15)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  vanishPull: { position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" },
  vanishChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  latest: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  latestBadge: { position: "absolute", top: -6, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  storyQuote: { gap: 4, marginBottom: 6 },
  storyThumb: { width: 64, height: 96, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4, padding: 6, overflow: "hidden" },
  storyPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  storyThumbText: { color: "#fff", fontSize: 10, lineHeight: 13, fontWeight: "700", textAlign: "center" },
  bumped: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 8, paddingBottom: 32 },
  day: { alignItems: "center", paddingVertical: 10 },
  older: { alignItems: "center", paddingVertical: 8 },
  olderDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 12, fontWeight: "600", paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  side: { flex: 1 },
  swipeHint: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", opacity: 0 },
  swipeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  padText: { paddingHorizontal: 12, paddingVertical: 6 },
  padVisual: { padding: 4 },
  caption: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 2 },
  mediaMeta: { paddingHorizontal: 8, paddingTop: 2, alignSelf: "flex-end" },
  text: { fontSize: 15, lineHeight: 20 },
  textRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "flex-end", columnGap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto", paddingTop: 2 },
  deleted: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  meta: { fontSize: 11 },
  jumboMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(28,25,23,0.4)",
  },
  stickerMeta: { position: "absolute", right: 4, bottom: 4 },
  emptyChip: { fontSize: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  onWallpaper: { backgroundColor: "rgba(0,0,0,0.28)", color: "#fff", overflow: "hidden" },
  service: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 8 },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sealed: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4, minWidth: 180 },
  sealedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sealedRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  sealedMeta: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 },
  resend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 4,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  hide: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  quote: { borderLeftWidth: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  quoteBody: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkCard: { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" },
  linkImage: { width: "100%", aspectRatio: 1.91 },
  linkBody: { paddingHorizontal: 8, paddingVertical: 4 },
});
