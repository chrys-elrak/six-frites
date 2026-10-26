import { unwrap } from "@six/sdk";
import {
  type ChatDTO,
  EPHEMERAL_RESEND,
  serviceSentence,
  type EphemeralDTO,
  type MessageDTO,
  type MessageEntity,
  type ReplyPreview,
  type ViewMessageResult,
} from "@six/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { GestureDetector, useLongPressGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import {
  Ban,
  Check,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  EyeOff,
  Flame,
  Lock,
  Palette,
  Phone,
  PhoneMissed,
  Video,
  RotateCcw,
  Timer,
  X,
} from "lucide-react-native";
import { type ComponentRef, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { applyEdited, deleteMessage, markOpenedLocally, react } from "@/lib/actions";
import { isFrozen, useMessages } from "@/lib/chats";
import { revealNow, useHydratedMessages } from "@/lib/e2ee";
import { useComposerMode } from "@/lib/composer";
import { emojiOnly } from "@/lib/emoji";
import { canResend, shortRule } from "@/lib/ephemeral";
import { clockTime, dayLabel, formatDuration, sameDay } from "@/lib/format";
import { alpha, useBubbleColors } from "@/lib/bubble-colors";
import { useT } from "@/lib/i18n";
import { segments } from "@/lib/markup";
import { six } from "@/lib/six";
import { type PendingMessage, useOutbox, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { deliver } from "@/lib/send";
import { useSelection } from "@/lib/selection";
import { useSpoilers } from "@/lib/spoilers";
import { brand, brandInk, flame, stone, type Theme, useTheme } from "@/lib/theme";
import { AnimatedEmoji } from "./animated-emoji";
import { AttachmentView, Lightbox, type LightboxItem, type ShownAttachment } from "./attachment";
import { EmojiPicker } from "./emoji-picker";
import { EphemeralViewer } from "./ephemeral-viewer";
import { MediaIcon, mediaLabel } from "./media-label";
import { type Anchor, ReactionChips, ReactionPopover } from "./reactions";
import { styleFor } from "./rich-text";
import { Sheet, type SheetAction } from "./sheet";

type Delivery = "sending" | "failed" | "sent" | "delivered" | "read";

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
  createdAt: string;
  mine: boolean;
  deleted: boolean;
  edited: boolean;
  attachment: ShownAttachment | null;
  type: MessageDTO["type"];
  ephemeral: EphemeralDTO | null;
  locked: "decrypting" | "undecryptable" | null;
  groupStart: boolean;
  groupEnd: boolean;
  delivery: Delivery | null;
}

type Row = { kind: "day"; key: string; at: string } | { kind: "service"; key: string; message: MessageDTO } | MsgRow;

interface Item {
  senderId: string;
  createdAt: string;
  row: Omit<MsgRow, "kind" | "groupStart" | "groupEnd" | "delivery">;
}

const lockOf = (m: MessageDTO & { undecryptable?: boolean; decrypting?: boolean }): MsgRow["locked"] =>
  m.deletedAt || m.type === "service" ? null : m.undecryptable ? "undecryptable" : m.decrypting ? "decrypting" : null;

function buildRows(
  messages: MessageDTO[],
  pending: PendingMessage[],
  meId: string,
  peerDeliveredAt: number,
  peerReadAt: number,
): Row[] {
  const sent = new Set(messages.filter((m) => m.senderId === meId).map((m) => m.clientId));
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
        replyTo: m.replyTo,
        createdAt: m.createdAt,
        mine: m.senderId === meId,
        deleted: m.deletedAt !== null,
        edited: m.editedAt !== null,
        attachment: m.attachment ? { source: "server" as const, data: m.attachment } : null,
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
          replyTo: p.replyTo,
          createdAt: p.createdAt,
          mine: true,
          deleted: false,
          edited: false,
          attachment: p.attachment
            ? { source: "local" as const, data: p.attachment, failed: p.status === "failed" }
            : null,
          type: (p.attachment?.kind ?? "text") as MessageDTO["type"],
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
                resendsLeft: EPHEMERAL_RESEND.max,
                resendUntil: null,
              }
            : null,
        },
      })),
  ];

  const rows: Row[] = [];
  items.forEach((it, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !sameDay(prev.createdAt, it.createdAt)) {
      rows.push({ kind: "day", key: `day:${it.createdAt}`, at: it.createdAt });
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
  if (delivery === "sending") return <Clock size={12} color={color} accessibilityLabel={tr.messages.status.sending} />;
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

function Quote({
  reply,
  name,
  mine,
  onPress,
}: {
  reply: ReplyPreview;
  name: string;
  mine: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const fg = mine ? bubble.ink : (bubble.theirInk ?? t.text);
  const dim = reply.deleted || reply.spoiler;
  return (
    <Pressable
      onPress={onPress}
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
        {reply.deleted ? null : reply.ephemeral ? (
          <Flame size={13} color={fg} />
        ) : reply.spoiler ? (
          <EyeOff size={13} color={fg} />
        ) : reply.type !== "text" ? (
          <MediaIcon type={reply.type} color={fg} size={13} />
        ) : null}
        <Text numberOfLines={2} style={{ color: fg, fontSize: 13, opacity: dim ? 0.7 : 0.8, fontStyle: dim ? "italic" : "normal", flexShrink: 1 }}>
          {reply.deleted
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
  const t = useTheme();
  const tr = useT();
  const revealed = useSpoilers((s) => !!s.revealed[row.key]);
  const reveal = useSpoilers((s) => s.reveal);
  const text = row.text ?? "";
  const entities =
    row.spoiler && !row.attachment
      ? [...row.entities, { type: "spoiler" as const, offset: 0, length: text.length }]
      : row.entities;
  if (entities.length === 0) return <>{text}</>;
  const codeBg = row.mine ? "rgba(0,0,0,0.1)" : "rgba(120,113,108,0.18)";
  const spoilerInk = row.mine ? "#b86c00" : t.dark ? stone[600] : stone[300];

  return (
    <>
      {segments(text, entities).map((seg, i) => {
        const style = styleFor(seg.styles, codeBg);
        if (!seg.styles.has("spoiler") || revealed) {
          return (
            <Text key={i} style={style}>
              {seg.text}
            </Text>
          );
        }
        return (
          <Text
            key={i}
            accessibilityLabel={tr.messages.revealSpoiler}
            onPress={selecting ? undefined : () => reveal(row.key)}
            style={[style, { color: spoilerInk, backgroundColor: spoilerInk }]}
          >
            {seg.text}
          </Text>
        );
      })}
    </>
  );
}

function Sealed({ row, color, onOpen }: { row: MsgRow; color: string; onOpen: () => void }) {
  const t = useTheme();
  const tr = useT();
  const e = row.ephemeral!;
  const kind = row.type === "text" ? tr.common.message : mediaLabel(row.type, tr);
  return (
    <Pressable onPress={onOpen} disabled={e.expired} style={styles.sealed}>
      <View style={[styles.sealedIcon, { backgroundColor: e.expired ? "rgba(120,113,108,0.15)" : "rgba(249,115,22,0.15)" }]}>
        <Flame size={20} color={e.expired ? t.muted : flame} fill={e.expired ? "none" : flame} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color, fontWeight: "700", fontSize: 15 }}>{e.expired ? tr.messages.opened : tr.messages.tapToView}</Text>
        <Text style={{ color, opacity: 0.7, fontSize: 12 }}>
          {kind} · {shortRule(e, tr)}
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

function Bubble({
  row,
  highlighted,
  selecting,
  selected,
  nameOf,
  maxWidth,
  onMenu,
  onQuote,
  onToggle,
  onOpen,
  onOpenEphemeral,
  onResend,
  meId,
  onReact,
  frozen,
}: {
  row: MsgRow;
  highlighted: boolean;
  selecting: boolean;
  selected: boolean;
  nameOf: (userId: string) => string;
  maxWidth: number;
  onMenu: (anchor?: Anchor) => void;
  onQuote: (id: string) => void;
  onToggle: () => void;
  onOpen: (item: LightboxItem) => void;
  onOpenEphemeral: () => void;
  onResend: () => void;
  meId: string;
  onReact: (emoji: string) => void;
  frozen: boolean;
}) {
  const t = useTheme();
  const tr = useT();
  const bubble = useBubbleColors();
  const selectable = selecting && row.message !== null;
  const mediaRevealed = useSpoilers((s) => !!s.revealed[row.key]);
  const revealMedia = useSpoilers((s) => s.reveal);
  const { mine, groupStart, groupEnd } = row;
  const e = row.ephemeral;
  const sealed = !!e && (e.locked || (e.expired && (!mine || e.purged)));
  const jumbo =
    !row.deleted && !row.ephemeral && !row.attachment && !row.spoiler && !row.replyTo && row.entities.length === 0 && row.text
      ? emojiOnly(row.text)
      : null;
  const visual = !sealed && row.attachment && (row.attachment.data.kind === "image" || row.attachment.data.kind === "video");
  const note = !sealed && row.attachment?.data.kind === "video_note" && !row.deleted;
  const hasText = !!row.text || row.deleted || !!row.locked;
  const big = 18;
  const small = 6;
  const radius = mine
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
  const bare = jumbo || note;
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
  const canReact = !frozen && !!row.message && !row.pending && !row.deleted && row.type !== "service" && !row.ephemeral?.purged;
  const latest = useRef({ selectable, selecting, canReact, onToggle, onMenu, onReact });
  latest.current = { selectable, selecting, canReact, onToggle, onMenu, onReact };
  const hold = useLongPressGesture({
    minDuration: 350,
    runOnJS: true,
    onActivate: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const l = latest.current;
      if (l.selectable) return l.onToggle();
      const node = bubbleRef.current;
      if (!node) return l.onMenu();
      node.measureInWindow((x, y, width, height) => l.onMenu({ x, y, width, height }));
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    runOnJS: true,
    onActivate: () => {
      const l = latest.current;
      if (!l.canReact || l.selecting) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      l.onReact("❤️");
    },
  });
  const gestures = useSimultaneousGestures(hold, doubleTap);

  return (
    <GestureDetector gesture={gestures}>
    <Pressable
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
      <View style={[styles.side, { alignItems: mine ? "flex-end" : "flex-start" }]}>
        <View
          ref={bubbleRef}
          collapsable={false}
          pointerEvents={selectable ? "none" : "auto"}
          style={[
            radius,
            tone,
            { maxWidth, overflow: "hidden" },
            !bare && (visual ? styles.padVisual : styles.padText),
            row.delivery === "failed" && { opacity: 0.6 },
            highlighted && { borderWidth: 3, borderColor: "rgba(56,189,248,0.6)" },
          ]}
        >
          {row.replyTo && !row.deleted && (
            <Quote reply={row.replyTo} mine={mine && !bare} name={nameOf(row.replyTo.senderId)} onPress={() => onQuote(row.replyTo!.id)} />
          )}
          {row.ephemeral && !sealed && !row.deleted && <SenderBadge e={row.ephemeral} color={fg} onResend={onResend} />}
          {row.attachment && !row.deleted && !sealed && (
            <AttachmentView
              attachment={row.attachment}
              mine={mine}
              onOpen={onOpen}
              hidden={row.spoiler && !mediaRevealed}
              onReveal={() => revealMedia(row.key)}
              maxWidth={maxWidth - 8}
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
          ) : note ? (
            <View style={[styles.jumboMeta, { alignSelf: mine ? "flex-end" : "flex-start", marginTop: 4 }]}>
              <Meta row={row} color="#fff" t={t} />
            </View>
          ) : (
            <View style={[styles.textRow, visual && (hasText ? styles.caption : styles.mediaMeta)]}>
              {row.deleted ? (
                <View style={styles.deleted}>
                  <Ban size={14} color={fg} />
                  <Text style={[styles.text, { color: fg, fontStyle: "italic" }]}>{tr.messages.deleted}</Text>
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
            mine={mine}
            nameOf={nameOf}
            onReact={frozen ? () => {} : onReact}
          />
        )}
        {row.delivery === "failed" && (
          <Pressable onPress={() => onMenu()} hitSlop={6}>
            <Text style={{ color: t.danger, fontSize: 12, fontWeight: "600", marginTop: 2 }}>{tr.messages.notSent}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
    </GestureDetector>
  );
}

export interface MessageListHandle {
  scrollToBottom: () => void;
}

export const MessageList = forwardRef<MessageListHandle, { chat: ChatDTO; meId: string; onSeen: () => void }>(
  function MessageList({ chat, meId, onSeen }, handle) {
    const t = useTheme();
    const tr = useT();
    const qc = useQueryClient();
    const { width } = useWindowDimensions();
    const { realtime } = useRealtime();
    const messages = useMessages(chat.id);
    const pending = usePending(chat.id);
    const setMode = useComposerMode((s) => s.set);
    const selecting = useSelection((s) => s.chatId === chat.id);
    const frozen = isFrozen(chat);
    const selectedIds = useSelection((s) => s.ids);
    const startSelection = useSelection((s) => s.start);
    const toggleSelected = useSelection((s) => s.toggle);
    const list = useRef<FlatList<Row>>(null);
    const atBottom = useRef(true);
    const [menuFor, setMenuFor] = useState<MsgRow | null>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
    const [reactingTo, setReactingTo] = useState<MessageDTO | null>(null);
    const [viewing, setViewing] = useState<ViewMessageResult | null>(null);
    const viewingRef = useRef(viewing);
    viewingRef.current = viewing;
    const closeViewer = useCallback(() => {
      const shown = viewingRef.current;
      if (!shown) return;
      viewingRef.current = null;
      setViewing(null);
      const id = shown.message.id;
      const e = shown.message.ephemeral;
      const endsAt = shown.expiresAt ? Date.parse(shown.expiresAt) : null;
      const viewsUsed = !!e?.maxViews && e.views >= e.maxViews;
      if (viewsUsed || (endsAt !== null && Date.now() >= endsAt - 250)) markOpenedLocally(qc, chat.id, id);
      else if (endsAt !== null) setTimeout(() => markOpenedLocally(qc, chat.id, id), endsAt - Date.now());
    }, [qc, chat.id]);

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
      try {
        const res = await six.api.POST("/v1/messages/{id}/view", { params: { path: { id } } });
        const result = unwrap(res);
        const message = await revealNow(meId, result.message);
        setViewing({ message, expiresAt: toLocalDeadline(result, res.response) });
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      }
    }

    const names = useMemo(() => new Map(chat.members.map((m) => [m.user.id, m.user.displayName])), [chat.members]);
    const nameOf = (id: string) => (id === meId ? tr.common.you : (names.get(id) ?? tr.common.someone));

    const { peerDeliveredAt, peerReadAt } = useMemo(() => {
      const peers = chat.members.filter((m) => m.user.id !== meId);
      const earliest = (pick: (m: (typeof peers)[number]) => string | null) =>
        peers.length ? Math.min(...peers.map((m) => (pick(m) ? Date.parse(pick(m)!) : 0))) : 0;
      return { peerDeliveredAt: earliest((m) => m.lastDeliveredAt), peerReadAt: earliest((m) => m.lastReadAt) };
    }, [chat.members, meId]);

    const loaded = useMemo(() => messages.data?.pages.flatMap((p) => p.items) ?? [], [messages.data]);
    const shown = useHydratedMessages(meId, loaded);
    const ordered = useMemo(() => shown.slice().reverse(), [shown]);
    const rows = useMemo(
      () => buildRows(ordered, pending, meId, peerDeliveredAt, peerReadAt).reverse(),
      [ordered, pending, meId, peerDeliveredAt, peerReadAt],
    );
    const scrollToBottom = () => list.current?.scrollToOffset({ offset: 0, animated: true });
    useImperativeHandle(handle, () => ({ scrollToBottom }));

    useEffect(() => {
      if (atBottom.current) onSeen();
    }, [chat.lastMessage?.id, onSeen]);

    useEffect(() => {
      if (!highlight) return;
      const timer = setTimeout(() => setHighlight(null), 1200);
      return () => clearTimeout(timer);
    }, [highlight]);

    function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
      const wasAtBottom = atBottom.current;
      atBottom.current = e.nativeEvent.contentOffset.y < 80;
      if (atBottom.current && !wasAtBottom) onSeen();
    }

    function jumpTo(id: string) {
      const index = rows.findIndex((r) => r.kind === "msg" && r.id === id);
      if (index < 0) return;
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlight(id);
    }

    const reactable = (row: MsgRow) =>
      !!row.message && !row.pending && !row.deleted && row.type !== "service" && !row.ephemeral?.purged;

    function reactionPopover(row: MsgRow, at: Anchor) {
      const m = row.message!;
      const own = (m.reactions ?? []).filter((r) => r.userIds.includes(meId)).map((r) => r.emoji);
      return (
        <ReactionPopover
          anchor={at}
          alignRight={row.mine}
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
            ? [{ label: tr.common.retry, onSelect: () => void deliver(qc, realtime, p) }]
            : []),
          { label: tr.messages.discard, destructive: true, onSelect: () => useOutbox.getState().remove(p.chatId, p.clientId) },
        ];
      }
      const m = row.message!;
      if (row.deleted) {
        return [
          { label: tr.common.select, onSelect: () => startSelection(chat.id, m.id) },
          ...(chat.type === "direct" || row.mine
            ? [
                {
                  label: chat.type === "direct" ? tr.messages.removeForMeAnd(chat.title) : tr.messages.removeForEveryone,
                  destructive: true,
                  onSelect: () => void deleteMessage(qc, m, "all").catch(() => null),
                },
              ]
            : []),
          { label: tr.messages.removeForMe, destructive: true, onSelect: () => void deleteMessage(qc, m, "me").catch(() => null) },
        ];
      }
      return [
        ...(frozen ? [] : [{ label: tr.messages.reply, onSelect: () => setMode(chat.id, { kind: "reply", message: m }) }]),
        { label: tr.common.select, onSelect: () => startSelection(chat.id, m.id) },
        ...(m.ephemeral || frozen
          ? []
          : [
              ...(row.mine && m.text !== null
                ? [{ label: tr.common.edit, onSelect: () => setMode(chat.id, { kind: "edit", message: m }) }]
                : []),
            ]),
        ...(m.ephemeral && canResend(m.ephemeral)
          ? [{ label: tr.messages.resendAgain, onSelect: () => void resendEphemeral(m) }]
          : []),
        { label: tr.common.delete, destructive: true, onSelect: () => setConfirmDelete(m) },
      ];
    }

    if (messages.isPending) {
      return (
        <View style={styles.center}>
          <Text style={{ color: t.muted }}>{tr.common.loading}</Text>
        </View>
      );
    }

    const maxWidth = Math.round(width * (selecting ? 0.72 : 0.8));

    return (
      <View style={{ flex: 1 }}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.onWallpaper, styles.emptyChip]}>{tr.messages.empty}</Text>
          </View>
        ) : (
          <FlatList
            ref={list}
            data={rows}
            inverted
            keyExtractor={(r) => r.key}
            onScroll={onScroll}
            scrollEventThrottle={64}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && void messages.fetchNextPage()}
            onScrollToIndexFailed={(info) => {
              list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
              setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 }), 100);
            }}
            contentContainerStyle={{ paddingVertical: 8 }}
            extraData={[selecting, selectedIds, highlight]}
            renderItem={({ item: row }) =>
              row.kind === "day" ? (
                <View style={styles.day}>
                  <Text style={[styles.dayText, styles.onWallpaper]}>{dayLabel(row.at)}</Text>
                </View>
              ) : row.kind === "service" ? (
                <View style={styles.service}>
                  <View style={[styles.serviceChip, styles.onWallpaper]}>
                    {row.message.action?.type === "theme" ? (
                      <Palette size={14} color="#fff" />
                    ) : row.message.action?.type === "e2ee" ? (
                      <Lock size={14} color="#fff" />
                    ) : row.message.action?.type === "call" ? (
                      row.message.action.secs === null ? (
                        <PhoneMissed size={14} color="#fff" />
                      ) : row.message.action.video ? (
                        <Video size={14} color="#fff" />
                      ) : (
                        <Phone size={14} color="#fff" />
                      )
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
                  </View>
                </View>
              ) : (
                <Bubble
                  row={row}
                  highlighted={row.id !== null && row.id === highlight}
                  selecting={selecting}
                  selected={row.id !== null && selecting && selectedIds.includes(row.id)}
                  nameOf={nameOf}
                  maxWidth={maxWidth}
                  onMenu={(at) => {
                    setAnchor(at ?? null);
                    setMenuFor(row);
                  }}
                  onQuote={jumpTo}
                  onToggle={() => row.id && toggleSelected(row.id)}
                  onOpen={setLightbox}
                  onOpenEphemeral={() => void openEphemeral(row)}
                  onResend={() => row.message && void resendEphemeral(row.message)}
                  meId={meId}
                  onReact={(emoji) => row.message && void react(qc, row.message, meId, emoji)}
                  frozen={frozen}
                />
              )
            }
          />
        )}

        {menuFor && (
          <Sheet
            floating={anchor && !frozen && reactable(menuFor) ? reactionPopover(menuFor, anchor) : undefined}
            actions={actionsFor(menuFor)}
            onClose={() => setMenuFor(null)}
          />
        )}
        <EmojiPicker
          open={reactingTo !== null}
          onClose={() => setReactingTo(null)}
          onPick={(emoji) => {
            if (reactingTo) void react(qc, reactingTo, meId, emoji);
            setReactingTo(null);
          }}
        />
        {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
        {viewing && <EphemeralViewer message={viewing.message} expiresAt={viewing.expiresAt} onClose={closeViewer} />}
        {confirmDelete && (
          <Sheet
            title={tr.messages.deleteTitle}
            onClose={() => setConfirmDelete(null)}
            actions={[
              ...(chat.type === "direct" || confirmDelete.senderId === meId
                ? [
                    {
                      label: chat.type === "direct" ? tr.messages.deleteForMeAnd(chat.title) : tr.messages.deleteForEveryone,
                      destructive: true,
                      onSelect: () => void deleteMessage(qc, confirmDelete, "all").catch(() => null),
                    },
                  ]
                : []),
              {
                label: tr.messages.deleteForMe,
                destructive: true,
                onSelect: () => void deleteMessage(qc, confirmDelete, "me").catch(() => null),
              },
            ]}
          />
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 8, paddingBottom: 32 },
  day: { alignItems: "center", paddingVertical: 10 },
  dayText: { fontSize: 12, fontWeight: "600", paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  side: { flex: 1 },
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
});
