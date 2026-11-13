"use client";

import { unwrap } from "@six/sdk";
import {
  type ChatDTO,
  type ChatGame,
  type Checklist,
  type Poll,
  type ChecklistMark,
  EPHEMERAL_RESEND,
  type EphemeralDTO,
  type GameMove,
  type GameMoveDTO,
  type GeoPoint,
  type MessageDTO,
  type MessageEntity,
  type MessageType,
  type GroupRole,
  type PublicUser,
  type ReplyPreview,
  type StickerDTO,
  textSize,
  type ViewMessageResult,
  previewLink,
  serviceSentence,
  splitLinks,
  isFrozen,
  type StoryReply,
  storyBackground,
  inkOn,
  commentsClosedNow,
  isBotGame,
  shareTargets,
  chatTheme,
  nicknameOf,
} from "@six/shared";
import { startBotGame } from "./bot-games";
import { Avatar } from "./avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  CircleUserRound,
  Clock,
  EyeOff,
  Film,
  Flag,
  Flame,
  Forward,
  Ghost,
  CircleFadingPlus,
  StickyNote,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Gamepad2,
  KeyRound,
  ListChecks,
  ChartBar,
  Loader2,
  Lock,
  MapPin,
  Mic,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Paperclip,
  RotateCcw,
  Copy,
  Sticker as StickerIcon,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VList, type VListHandle } from "virtua";
import { dragSelect } from "@/lib/drag-select";
import {
  applyEdited,
  check,
  vote,
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
import { type Hydrated, hydrate, messageFile } from "@/lib/e2ee";
import { RestoreBackupDialog, useHasRecoveryKey } from "@/components/encryption-settings";
import { EPHEMERAL_OPTIONS, shortRule } from "@/lib/ephemeral";
import { six } from "@/lib/six";
import { isAppChat, isBotChat, loadUntil, useMessages } from "@/lib/chats";
import { useComposerMode } from "@/lib/composer";
import { PhotoEditor } from "./photo-editor";
import { clockTime, dayLabel, formatDuration, sameDay } from "@/lib/format";
import { emojiOnly, splitEmoji } from "@/lib/emoji";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/long-press";
import { segments } from "@/lib/markup";
import { type PendingMessage, useOutbox, usePending } from "@/lib/outbox";
import { useRealtime } from "@/lib/realtime";
import { HelloGif } from "./hello-gif";
import { deliver, forwardMessages, queueMessage } from "@/lib/send";
import { useSelection } from "@/lib/selection";
import { useSpoilers } from "@/lib/spoilers";
import { useSwipe } from "@/lib/swipe";
import { AnimatedEmoji } from "./animated-emoji";
import { AlbumViewer, AttachmentView, Lightbox, type LightboxItem, type ShownAttachment } from "./attachment";
import { ChatPicker } from "./chat-picker";
import { StoryComposer } from "./story-composer";
import { StoryReplyLink } from "./stories";
import { useChatLayout } from "@/lib/chat-layout";
import { NoteEditor } from "./notes";
import { ChecklistView } from "./checklist";
import { PollView } from "./poll";
import { GameView } from "./game";
import { LocationCard } from "./location-card";
import { EphemeralViewer } from "./ephemeral-viewer";
import { PackDialog } from "./pack-dialog";
import { ReportDialog } from "./report-dialog";
import { Styled } from "./rich-text";
import { ReactionBar, ReactionChips, ReactionPicker, ReactionPopover, useQuickReactions } from "./reactions";
import { MessageMenu } from "./message-menu";
import { MessageTiming } from "./message-timing";
import { Sheet, type SheetAction } from "./sheet";
import { ServiceIcon } from "./service-icon";
import { StickerView } from "./sticker";

type Delivery = "sending" | "waiting" | "failed" | "sent" | "delivered" | "read";

interface MsgRow {
  kind: "msg";
  key: string;
  id: string | null;
  message: Hydrated | null;
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
  groupId: string | null;
  album: AlbumItem[] | null;
  sticker: StickerDTO | null;
  location: GeoPoint | null;
  checklist: Checklist | null;
  checks: ChecklistMark[];
  poll: Poll | null;
  votes: number[];
  myVote: number | null;
  pollVisible: boolean;
  voters: MessageDTO["voters"];
  game: ChatGame | null;
  moves: GameMoveDTO[];
  type: MessageDTO["type"];
  ephemeral: EphemeralDTO | null;
  locked: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  delivery: Delivery | null;
}

interface AlbumItem {
  key: string;
  message: Hydrated | null;
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

/** A reply shows the message it quotes as it reads now when that one is loaded, not as it read when replied to. */
function buildRows(
  messages: Hydrated[],
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
        attachment: m.attachment ? { source: "server" as const, data: m.attachment, file: m.file } : null,
        groupId: m.groupId ?? null,
        album: null,
        sticker: m.sticker,
        location: m.location,
        checklist: m.checklist,
        checks: m.checks ?? [],
        poll: m.poll ?? null,
        votes: m.votes ?? [],
        myVote: m.myVote ?? null,
        pollVisible: m.pollVisible ?? false,
        voters: m.voters ?? [],
        game: m.game ?? null,
        moves: m.moves ?? [],
        type: m.type,
        ephemeral: m.ephemeral,
        locked: !!m.undecryptable,
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
          groupId: p.groupId ?? null,
          album: null,
          sticker: p.sticker,
          location: p.location ?? null,
          checklist: p.checklist ?? null,
          checks: [],
          poll: p.poll ?? null,
          votes: [],
          myVote: null,
          pollVisible: p.pollVisible ?? false,
          voters: [],
          game: p.game ?? null,
          moves: [],
          type: (p.sticker
            ? "sticker"
            : p.location
              ? "location"
              : p.checklist
                ? "checklist"
                : p.poll
                  ? "poll"
                  : p.game
                  ? "game"
                  : (p.attachment?.kind ?? "text")) as MessageDTO["type"],
          locked: false,
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

/** On a white-on-dark pill read ticks turn sky blue; inside a bubble they keep its text colour at full strength. */
function Ticks({ delivery, pill = false }: { delivery: Delivery; pill?: boolean }) {
  const tr = useT();
  if (delivery === "sending" || delivery === "waiting") return <Clock aria-label={tr.messages.status.sending} className="size-3" />;
  if (delivery === "failed") return null;
  const label = tr.messages.status[delivery];
  return (
    <span
      aria-label={label}
      title={label}
      className={delivery === "read" ? (pill ? "text-sky-300" : "") : pill ? "" : "opacity-70"}
    >
      {delivery === "sent" ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : (
        <CheckCheck className="size-3.5" strokeWidth={2.5} />
      )}
    </span>
  );
}

/** The story a message answers: a small copy of it, under who answered and how. */
function StoryQuote({ story, mine, reaction }: { story: StoryReply; mine: boolean; reaction: boolean }) {
  const tr = useT();
  const t = tr.stories;
  const [broken, setBroken] = useState(false);
  const picture = story.imageUrl && !broken ? story.imageUrl : null;
  if (story.kind === "note") {
    return (
      <span className="mb-1.5 flex min-w-0 flex-col items-start gap-1">
        <span className="text-xs opacity-75">{mine ? t.youRepliedToNote : t.repliedToNote}</span>
        <span
          style={story.background ? { background: story.background, color: inkOn(story.background) } : undefined}
          className={`line-clamp-4 max-w-full rounded-2xl px-3 py-1.5 text-sm break-words ${story.background ? "" : "bg-black/10 dark:bg-white/10"}`}
        >
          {story.text ?? t.gif}
        </span>
      </span>
    );
  }
  return (
    <span className="mb-1.5 flex flex-col gap-1">
      <span className="text-xs opacity-75">{mine ? (reaction ? t.youReacted : t.youReplied) : reaction ? t.reactedToYours : t.repliedToYours}</span>
      <span
        className="relative flex h-24 w-16 items-center justify-center overflow-hidden rounded-xl p-1.5 text-center text-[10px] leading-tight font-semibold text-white"
        style={{ background: story.kind === "text" ? storyBackground(story.background ?? "#eb8a00") : "#292524" }}
      >
        {story.kind === "text" ? (
          <span className="line-clamp-6 break-words">{story.text}</span>
        ) : picture ? (
          <>
            <img src={picture} alt="" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
            {story.kind === "video" && (
              <span className="relative grid size-7 place-items-center rounded-full bg-black/45">
                <Video className="size-4" />
              </span>
            )}
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 opacity-90">
            {story.kind === "video" ? <Video className="size-5" /> : <ImageIcon className="size-5" />}
            {story.kind === "video" ? t.video : t.photo}
          </span>
        )}
      </span>
    </span>
  );
}

function Quote({
  reply,
  name,
  mine,
  onClick,
  earlier = false,
}: {
  reply: ReplyPreview;
  name: string;
  mine: boolean;
  onClick: () => void;
  /** Quotes a message from before I joined the group: its text stays hidden, and there's nothing to jump to. */
  earlier?: boolean;
}) {
  const tr = useT();
  return (
    <button
      type="button"
      onClick={earlier ? undefined : onClick}
      disabled={earlier}
      className={`mb-1 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-[13px] leading-snug ${
        mine ? "border-brand-ink/40 bg-black/10" : "border-brand bg-black/5 dark:bg-white/10"
      }`}
    >
      <span className="block font-semibold">{name}</span>
      <span className={`line-clamp-2 ${reply.deleted || reply.spoiler || earlier ? "italic opacity-70" : "opacity-80"}`}>
        {earlier ? (
          tr.messages.beforeYouJoined
        ) : reply.deleted ? (
          tr.summary.messageDeleted
        ) : reply.ephemeral ? (
          <span className="inline-flex items-center gap-1">
            <Flame className="size-3.5" /> {tr.summary.selfDestructing}
          </span>
        ) : reply.spoiler ? (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="size-3.5" /> {tr.summary.spoiler}
          </span>
        ) : reply.type !== "text" && reply.type !== "service" ? (
          <span className="inline-flex items-center gap-1">
            <MediaLabel type={reply.type} />
            {reply.text && <span className="truncate">· {reply.text}</span>}
          </span>
        ) : (
          reply.text
        )}
      </span>
    </button>
  );
}

const mediaIcons = {
  image: ImageIcon,
  video: Video,
  video_note: CircleUserRound,
  voice: Mic,
  file: Paperclip,
  gif: Film,
  sticker: StickerIcon,
  location: MapPin,
  checklist: ListChecks,
  poll: ChartBar,
  game: Gamepad2,
} as const;

export function MediaLabel({ type }: { type: MessageType }) {
  const tr = useT();
  if (type === "text" || type === "service") return null;
  const Icon = mediaIcons[type];
  return (
    <>
      <Icon className="size-3.5 shrink-0" /> {tr.summary.kinds[type]}
    </>
  );
}

function MessageText({ row, selectable }: { row: MsgRow; selectable: boolean }) {
  const tr = useT();
  const revealed = useSpoilers((s) => !!s.revealed[row.key]);
  const reveal = useSpoilers((s) => s.reveal);
  const text = row.text ?? "";
  const entities =
    row.spoiler && !row.attachment
      ? [...row.entities, { type: "spoiler" as const, offset: 0, length: text.length }]
      : row.entities;
  if (entities.length === 0) return <Linked text={text} />;

  return (
    <>
      {segments(text, entities).map((seg, i) => {
        const hidden = seg.styles.has("spoiler") && !revealed;
        const styled = (
          <Styled styles={seg.styles} color={seg.color} font={seg.font} size={seg.size} highlight={seg.highlight} outline={seg.outline}>{hidden || seg.styles.has("code") ? seg.text : <Linked text={seg.text} size={seg.size} />}</Styled>
        );
        if (!hidden) return <span key={i}>{styled}</span>;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={tr.messages.revealSpoiler}
            onClick={(e) => {
              if (selectable) return;
              e.stopPropagation();
              reveal(row.key);
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && reveal(row.key)}
            className="spoiler cursor-pointer"
          >
            {styled}
          </span>
        );
      })}
    </>
  );
}

const MENTION_SPLIT = /(@#[0-9A-F]{6}\b)/;

/** In a group, how I'm written when someone mentions me, like @#3FA2C1, to show as "@You" instead. */
const MyMention = createContext<string | null>(null);

/** Text with its links, mentions and animated emoji; the emoji grow with the text's size when it has one. */
export function Linked({ text, size }: { text: string; size?: string }) {
  const tr = useT();
  const me = useContext(MyMention);
  const emoji = Math.round((textSize(size) ?? 16) * 1.25);
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {part.text}
          </a>
        ) : (
          part.text.split(MENTION_SPLIT).map((piece, k) =>
            k % 2 ? (
              <span key={`${i}@${k}`} className={`rounded px-0.5 font-semibold ${piece === me ? "bg-brand/30" : "bg-current/10"}`}>
                {piece === me ? `@${tr.common.you}` : piece}
              </span>
            ) : (
              splitEmoji(piece).map((s, j) => (j % 2 ? <AnimatedEmoji key={`${i}:${k}:${j}`} emoji={s} size={emoji} /> : s))
            ),
          )
        ),
      )}
    </>
  );
}

const SPAN: Record<number, string> = { 6: "col-span-6", 3: "col-span-3", 2: "col-span-2" };

/** An album as one grid: two per row up to four, three per row after that, the leftovers made wider on top. */
function AlbumGrid({
  items,
  mine,
  hidden,
  chip,
  onReveal,
  onOpen,
}: {
  items: AlbumItem[];
  mine: boolean;
  hidden: (item: AlbumItem) => boolean;
  chip: (item: AlbumItem) => string | undefined;
  onReveal: (key: string) => void;
  onOpen: (index: number) => void;
}) {
  const perRow = items.length <= 4 ? 2 : 3;
  const extra = items.length % perRow;
  return (
    <div className="grid w-72 max-w-full grid-cols-6 gap-0.5 overflow-hidden rounded-xl">
      {items.map((it, i) => {
        const span = extra && i < extra ? 6 / extra : 6 / perRow;
        return (
          <div key={it.key} className={`${SPAN[span]} ${span === 6 ? "aspect-[2/1]" : "aspect-square"}`}>
            <AttachmentView
              attachment={it.attachment}
              mine={mine}
              tile
              onOpen={() => onOpen(i)}
              hidden={hidden(it)}
              hiddenLabel={chip(it)}
              onReveal={() => onReveal(it.key)}
            />
          </div>
        );
      })}
    </div>
  );
}

export function LinkCard({ url, mine }: { url: string; mine: boolean }) {
  const { data } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: async () => unwrap(await six.api.GET("/v1/link-preview", { params: { query: { url } } })),
    staleTime: Infinity,
    retry: false,
  });
  if (!data) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mb-1 block w-72 max-w-full overflow-hidden rounded-lg border-l-4 text-[13px] leading-snug ${
        mine ? "border-brand-ink/40 bg-black/10" : "border-brand bg-black/5 dark:bg-white/10"
      }`}
    >
      {data.image && <img src={data.image} alt="" draggable={false} className="aspect-[1.91] w-full object-cover" />}
      <span className="block px-2 py-1">
        <span className="block truncate opacity-70">{data.siteName}</span>
        <span className="line-clamp-2 font-semibold">{data.title}</span>
        {data.description && <span className="line-clamp-3 opacity-80">{data.description}</span>}
      </span>
    </a>
  );
}

function Sealed({ row, onOpen }: { row: MsgRow; onOpen: () => void }) {
  const tr = useT();
  const e = row.ephemeral!;
  const kind = row.type === "text" || row.type === "service" ? tr.common.message : tr.summary.kinds[row.type];
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={e.expired}
      className="flex min-w-48 items-center gap-3 py-1 text-left disabled:cursor-default"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-full ${
          e.expired
            ? "bg-stone-500/15 text-stone-500"
            : row.mine
              ? "bg-black/10"
              : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
        }`}
      >
        <Flame className={`size-5 ${e.expired ? "" : "fill-current"}`} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{e.expired ? tr.messages.opened : tr.messages.tapToView}</span>
        <span className="block text-xs opacity-70">
          {kind} · {shortRule(e, tr)}
          {e.resent && ` · ${tr.messages.resent}`}
        </span>
      </span>
    </button>
  );
}

export const canResend = (e: EphemeralDTO) =>
  e.expired && !e.purged && e.resendsLeft > 0 && !!e.resendUntil && Date.now() < Date.parse(e.resendUntil);

function SenderBadge({ e, onResend }: { e: EphemeralDTO; onResend: () => void }) {
  const tr = useT();
  return (
    <span className="mb-0.5 flex items-center gap-1 text-[11px] opacity-80">
      <Flame className="size-3" />
      {shortRule(e, tr)} ·{" "}
      {e.expired || e.views
        ? e.views > 1
          ? tr.messages.openedTimes(e.views)
          : tr.messages.opened
        : tr.messages.notOpened}
      {canResend(e) && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onResend();
          }}
          className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-black/10 px-1.5 py-0.5 font-semibold hover:bg-black/20 dark:bg-white/10"
        >
          <RotateCcw className="size-3" /> {tr.messages.resendLeft(e.resendsLeft)}
        </button>
      )}
    </span>
  );
}

/**
 * Under an encrypted message someone couldn't open: they can restore it from their backup or ask for it
 * again, and once they have asked, the sender's devices offer to encrypt it again for everyone's devices.
 */
function ResealPrompt({ message, mine, locked, meId }: { message: Hydrated; mine: boolean; locked: boolean; meId: string }) {
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

  const action = "inline-flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-50";
  return (
    <span
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 self-stretch px-1.5 text-xs ${mine ? "justify-end" : "justify-start"}`}
    >
      {note && <span className="text-stone-500 dark:text-stone-400">{note}</span>}
      {restorable && (
        <button type="button" onClick={() => setRestoring(true)} className={action}>
          <KeyRound className="size-3.5" /> {tr.messages.restoreFromBackup}
        </button>
      )}
      {(canResend || canAsk) && (
        <button type="button" disabled={busy} onClick={() => void run()} className={action}>
          <RotateCcw className="size-3.5" /> {canResend ? tr.messages.resendEncrypted : tr.messages.askResend}
        </button>
      )}
      {restoring && <RestoreBackupDialog onClose={() => setRestoring(false)} />}
    </span>
  );
}

function Bubble({
  row,
  highlighted,
  selecting,
  selected,
  nameOf,
  onMenu,
  onReply,
  onQuote,
  onToggle,
  onDragPick,
  onOpen,
  onOpenEphemeral,
  onResend,
  onOpenPack,
  meId,
  onReact,
  onReactButton,
  onCheck,
  onVote,
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
  onMenu: (at?: { x: number; y: number }, rect?: DOMRect) => void;
  onReply: () => void;
  onQuote: (id: string) => void;
  onToggle: () => void;
  /** Starts picking a run of messages from this one: after a long press, or on a mouse press. */
  onDragPick: (mouse: boolean) => void;
  onOpen: (item: LightboxItem) => void;
  onOpenEphemeral: () => void;
  onResend: () => void;
  onOpenPack: (packId: string) => void;
  meId: string;
  onReact: (emoji: string) => void;
  onReactButton: (anchor: DOMRect) => void;
  onCheck: (item: number) => void;
  onVote: (option: number) => void;
  onPlay: (move: GameMove) => void;
  onSendGame: (game: ChatGame) => void;
  onOpenAlbum: (items: ShownAttachment[], start: number) => void;
  /** Safe view is on: the photos and videos in the chat, yours too, stay blurred until tapped. */
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
  const tr = useT();
  const compact = useChatLayout((s) => s.layout === "compact");
  const selectable = selecting && row.message !== null;
  const bubble = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const favorite = useQuickReactions()[0]!;
  const anchor = () => bubble.current!.getBoundingClientRect();
  const press = useLongPress(selectable ? (at) => (at ? onToggle() : onDragPick(false)) : (at) => !gamesOnly && onMenu(at, anchor()));
  const reactable = !selecting && !frozen && !gamesOnly && canReact(row);
  const swipe = useSwipe(
    !selecting && !frozen && !gamesOnly && row.message && !row.pending && !row.deleted ? onReply : null,
    row.mine && !compact ? -1 : 1,
  );

  function onTap(e: React.MouseEvent) {
    if (!reactable || (e.target as Element).closest("a, button, video, audio, input")) return;
    if (e.timeStamp - lastTap.current < 300) {
      lastTap.current = 0;
      onReact(favorite);
    } else lastTap.current = e.timeStamp;
  }
  const revealedMedia = useSpoilers((s) => s.revealed);
  const revealMedia = useSpoilers((s) => s.reveal);
  const { mine, groupStart, groupEnd } = row;
  const right = mine && !compact;
  const e = row.ephemeral;
  const sealed = !!e && (mine || e.locked || e.expired);
  const jumbo =
    !row.deleted &&
    !row.ephemeral &&
    !row.attachment &&
    !row.spoiler &&
    !row.replyTo &&
    !row.story &&
    row.entities.length === 0 &&
    row.text
      ? emojiOnly(row.text)
      : null;
  const visual = !sealed && row.attachment && ["image", "video", "gif"].includes(row.attachment.data.kind);
  const blurred = (key: string, spoiler: boolean, safeToo = true) => (spoiler || (safe && safeToo)) && !revealedMedia[key];
  const chip = (spoiler: boolean) => (spoiler ? undefined : tr.messages.tapToShow);
  const note = !sealed && row.attachment?.data.kind === "video_note" && !row.deleted;
  const sticker = !sealed && !row.deleted ? row.sticker : null;
  const loose = !sealed && !row.deleted && row.attachment?.source === "server" && !!row.attachment.file?.sticker;
  const hasText = !!row.text || row.deleted || row.locked;
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
  const stamp = (
    <>
      {row.edited && !row.deleted && <span className="opacity-70">{tr.messages.edited}</span>}
      <span className="opacity-70">{clockTime(row.createdAt)}</span>
      {row.delivery && <Ticks delivery={row.delivery} />}
    </>
  );
  const link =
    !sealed && !row.deleted && !row.locked && !row.attachment && !row.spoiler && row.text
      ? previewLink(row.text, row.entities)
      : null;
  const radius = right
    ? `rounded-tl-2xl rounded-bl-2xl ${groupStart ? "rounded-tr-2xl" : "rounded-tr-md"} ${groupEnd ? "rounded-br-2xl" : "rounded-br-md"}`
    : `rounded-tr-2xl rounded-br-2xl ${groupStart ? "rounded-tl-2xl" : "rounded-tl-md"} ${groupEnd ? "rounded-bl-2xl" : "rounded-bl-md"}`;
  const tone =
    jumbo || note || sticker || loose
      ? "bg-transparent text-stone-900 dark:text-stone-100"
      : row.deleted
        ? "bg-transparent text-stone-500 ring-1 ring-inset ring-stone-300 dark:ring-stone-700"
        : mine
          ? "bg-brand text-brand-ink"
          : "bg-(--bubble-their) text-(--bubble-their-ink) ring-1 ring-inset ring-stone-200 dark:ring-stone-700";
  const dashes =
    row.vanish && !row.deleted && !(jumbo || note || sticker || loose)
      ? `outline-2 outline-dashed -outline-offset-2 ${mine ? "outline-brand-ink/40" : "outline-(--bubble-their-ink)/30"}`
      : "";

  return (
    <div
      {...swipe.handlers}
      data-pick={selectable ? (row.id ?? undefined) : undefined}
      onPointerDown={(e) => {
        swipe.handlers.onPointerDown(e);
        if (selectable && e.pointerType === "mouse" && e.button === 0) onDragPick(true);
      }}
      onClickCapture={
        selectable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }
          : undefined
      }
      className={`group relative flex touch-pan-y touch-pinch-zoom items-center gap-2 overflow-x-clip px-3 ${selectable ? "cursor-pointer" : ""} ${
        selected ? "bg-brand/10" : ""
      } ${groupEnd ? "pb-3" : "pb-1"}`}
    >
      {selecting && (
        <span className={`shrink-0 ${row.message ? "" : "invisible"}`} aria-hidden>
          {selected ? (
            <CheckCircle2 className="size-5 fill-brand text-white dark:text-stone-950" />
          ) : (
            <Circle className="size-5 text-stone-400" />
          )}
        </span>
      )}
      <div
        ref={swipe.hint}
        className={`pointer-events-none absolute inset-y-0 flex items-center opacity-0 ${right ? "right-3" : "left-3"}`}
      >
        <span className="grid size-8 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm">
          <Reply className="size-4" />
        </span>
      </div>
      <div ref={swipe.moving} className={`flex min-w-0 flex-1 ${right ? "justify-end" : "justify-start"}`}>
        <div className={`flex items-center gap-1 ${compact ? "min-w-0 flex-1 gap-2" : "max-w-[80%] md:max-w-[65%]"} ${right ? "flex-row-reverse" : ""}`}>
          {sender && (
            <span className={`w-9 shrink-0 ${compact ? "self-start pt-6" : "self-end"}`}>
              {(compact ? groupStart : groupEnd) && <Avatar user={mine ? { ...sender, displayName: "#" } : sender} />}
            </span>
          )}
          <div className={`flex min-w-0 flex-col gap-1 ${compact ? "items-start" : "items-end"}`}>
            {sender && groupStart && (
              <span className={`flex items-center gap-1.5 self-start text-xs font-semibold text-brand ${compact ? "text-sm" : "px-3"}`}>
                {sender.displayName}
                {sender.role && sender.role !== "member" && (
                  <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold tracking-wide uppercase">
                    {sender.role === "owner" ? tr.groups.owner : tr.groups.admin}
                  </span>
                )}
              </span>
            )}
            <div className="relative max-w-full">
            <div
              ref={bubble}
              {...press}
              onClick={onTap}
              onMouseDown={(e) => reactable && e.detail > 1 && e.preventDefault()}
              className={`${(visual || loose) && !hasText ? "relative " : ""}${radius} ${tone} ${dashes} ${jumbo || note || sticker || loose ? "" : visual ? "p-1" : "px-3 py-1.5"} max-w-full transition-shadow [-webkit-touch-callout:none] pointer-coarse:select-none ${
                row.delivery === "failed" ? "opacity-60" : ""
              } ${highlighted ? "ring-4 ring-sky-400/60" : ""}`}
            >
              {row.bump && !row.deleted && (
                <span className="mb-1 flex items-center gap-1 text-xs font-medium opacity-80">
                  <ArrowUp className="size-3.5" />
                  {tr.messages.bumped}
                </span>
              )}
              {row.replyTo && !row.deleted && (
                <Quote
                  reply={row.replyTo}
                  mine={mine}
                  name={nameOf(row.replyTo.senderId)}
                  onClick={() => onQuote(row.replyTo!.id)}
                  earlier={quoteEarlier}
                />
              )}
              {row.story && !row.deleted && (
                <StoryReplyLink id={row.story.id} note={row.story.kind === "note"}>
                  <StoryQuote story={row.story} mine={mine} reaction={!!row.text && !!emojiOnly(row.text)} />
                </StoryReplyLink>
              )}
              {e && mine && !e.purged && !row.deleted && <SenderBadge e={e} onResend={onResend} />}
              {row.album && !row.deleted && !sealed ? (
                <AlbumGrid
                  items={row.album}
                  mine={mine}
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
                    hidden={visual || (note && row.spoiler) ? blurred(row.key, row.spoiler, !loose && row.attachment.data.kind !== "gif") : false}
                    hiddenLabel={chip(row.spoiler)}
                    onReveal={() => revealMedia(row.key)}
                    autoPlay={autoPlay}
                    onStop={onVoiceStop}
                    track={
                      row.message
                        ? { chatId: row.message.chatId, title: row.mine ? tr.common.you : nameOf(row.message.senderId) }
                        : undefined
                    }
                    meta={
                      inlineVoice && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] leading-none">{stamp}</span>
                      )
                    }
                  />
                )
              )}
              {link && <LinkCard url={link} mine={mine} />}
              {row.location && !row.deleted && !sealed && <LocationCard point={row.location} mine={mine} />}
              {row.checklist && !row.deleted && (
                <ChecklistView
                  list={row.checklist}
                  checks={row.checks}
                  nameOf={nameOf}
                  onCheck={row.message && !frozen && !selecting ? onCheck : undefined}
                />
              )}
              {row.poll && !row.deleted && (
                <PollView poll={row.poll} votes={row.votes} myVote={row.myVote} visible={row.pollVisible} voters={row.voters} nameOf={nameOf} onVote={row.message && !frozen && !selecting ? onVote : undefined} />
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
                <div className="flex items-end gap-2">
                  <Sealed row={row} onOpen={onOpenEphemeral} />
                  <span className="mb-1 flex shrink-0 items-center gap-1 text-[11px] leading-none">
                    <span className="opacity-70">{clockTime(row.createdAt)}</span>
                    {row.delivery && <Ticks delivery={row.delivery} />}
                  </span>
                </div>
              ) : sticker ? (
                <div className="relative">
                  <button
                    type="button"
                    className="block"
                    onClick={() => onOpenPack(sticker.packId)}
                    aria-label={tr.messages.stickerPack(sticker.emoji)}
                  >
                    <StickerView sticker={sticker} size={160} />
                  </button>
                  <span className="pointer-events-none absolute right-1 bottom-1 flex items-center gap-1 rounded-full bg-stone-900/45 px-2 py-0.5 text-[11px] leading-none text-white">
                    {clockTime(row.createdAt)}
                    {row.delivery && <Ticks delivery={row.delivery} pill />}
                  </span>
                </div>
              ) : jumbo ? (
                <div className="flex flex-col items-end">
                  <div className="flex">
                    {jumbo.map((e, i) => (
                      <AnimatedEmoji key={`${e}:${i}`} emoji={e} size={jumbo.length === 1 ? 112 : 80} />
                    ))}
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-stone-900/40 px-2 py-0.5 text-[11px] leading-none text-white">
                    {row.edited && <span>{tr.messages.edited}</span>}
                    {clockTime(row.createdAt)}
                    {row.delivery && <Ticks delivery={row.delivery} pill />}
                  </span>
                </div>
              ) : (visual || loose) && !hasText ? (
                <span className={`pointer-events-none absolute ${loose ? "right-1 bottom-1" : "right-2.5 bottom-2.5"} flex items-center gap-1 rounded-full bg-stone-900/45 px-2 py-0.5 text-[11px] leading-none text-white`}>
                  {row.edited && <span>{tr.messages.edited}</span>}
                  {clockTime(row.createdAt)}
                  {row.delivery && <Ticks delivery={row.delivery} pill />}
                </span>
              ) : inlineVoice ? null : (
                <p
                  className={`flow-root whitespace-pre-wrap break-words text-[15px] leading-snug ${row.deleted ? "italic" : ""} ${
                    visual ? "px-2 pt-1 pb-0.5" : ""
                  } ${!hasText ? "-mt-0.5 min-h-4" : ""}`}
                >
                  {!hasText ? null : row.deleted ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Ban className="size-4" /> {deletedText}
                    </span>
                  ) : row.locked ? (
                    <span
                      className="inline-flex items-center gap-1.5 italic opacity-80"
                      title={tr.messages.waitingHint}
                    >
                      <Lock className="size-4" /> {tr.messages.waiting}
                    </span>
                  ) : (
                    <MessageText row={row} selectable={selectable} />
                  )}
                  <span className="float-right ml-2 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none">
                    {stamp}
                  </span>
                </p>
              )}
            </div>
              <div
                className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1 ${right ? "right-full mr-1 flex-row-reverse" : "left-full ml-1"}`}
              >
            {reactable && (
              <button
                onClick={() => onReactButton(anchor())}
                aria-label={tr.messages.react}
                className="hidden size-7 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-200 group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:hover:bg-stone-800"
              >
                <SmilePlus className="size-4" />
              </button>
            )}
            {comments && !commentsClosedNow(comments) && !row.deleted && (
              <button
                onClick={onOpenThread}
                aria-label={tr.groups.comment}
                title={tr.groups.comment}
                className="hidden size-7 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-200 group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:hover:bg-stone-800"
              >
                <MessageCircle className="size-4" />
              </button>
            )}
            {!gamesOnly && (
              <button
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onMenu({ x: r.left, y: r.bottom }, anchor());
                }}
                aria-label={tr.messages.options}
                className="hidden size-7 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition hover:bg-stone-200 group-hover:opacity-100 focus:opacity-100 pointer-fine:grid dark:hover:bg-stone-800"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
              </div>
            </div>
            {row.message && !row.deleted && (
              <ReactionChips message={row.message} meId={meId} mine={right} nameOf={nameOf} onReact={onReact} />
            )}
            {comments && !row.deleted && (comments.count > 0 || commentsClosedNow(comments)) && (
              <button
                type="button"
                onClick={onOpenThread}
                className="flex items-center gap-1 px-2 text-xs font-semibold text-brand hover:underline"
              >
                {commentsClosedNow(comments) ? <Lock className="size-3.5" /> : <MessageCircle className="size-3.5" />}
                {comments.count > 0 ? tr.groups.comments(comments.count) : tr.groups.commentsClosed}
              </button>
            )}
            {row.message && !row.deleted && <ResealPrompt message={row.message} mine={mine} locked={row.locked} meId={meId} />}
            {row.delivery === "waiting" && <p className="px-1 text-xs text-stone-500">{tr.chats.waitingForNetwork}</p>}
            {row.delivery === "failed" && (
              <button onClick={() => onMenu(undefined, anchor())} className="text-xs font-medium text-red-600 dark:text-red-400">
                {tr.messages.notSent}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const canReact = (row: MsgRow) =>
  !!row.message && !row.pending && !row.deleted && row.message.type !== "service" && !row.message.ephemeral?.purged;

export interface MessageListHandle {
  scrollToBottom: () => void;
  /** Loads the history down to this message if needed, then scrolls to it and highlights it. */
  jumpTo: (messageId: string) => void;
}

const VANISH_PULL = 120;

export const MessageList = forwardRef<
  MessageListHandle,
  {
    chat: ChatDTO;
    meId: string;
    onSeen: () => void;
    insetTop?: number;
    insetBottom?: number;
    /** Shows the comments on this group message, with the message itself on top, instead of the chat. */
    threadId?: string;
    onOpenThread?: (m: MessageDTO) => void;
  }
>(
  function MessageList({ chat, meId, onSeen, insetTop = 0, insetBottom = 0, threadId, onOpenThread }, handle) {
    const frozen = isFrozen(chat);
    const meMember = chat.group ? chat.members.find((m) => m.user.id === meId) : undefined;
    const myMention = meMember ? `@${nicknameOf(meMember.user)}` : null;
    const tr = useT();
    const qc = useQueryClient();
    const { realtime } = useRealtime();
    const router = useRouter();
    const messages = useMessages(chat.id, threadId);
    const main = useMessages(chat.id);
    const pending = usePending(chat.id, threadId);
    const slot = threadId ? `${chat.id}:${threadId}` : chat.id;
    const groupAdmin = !!chat.group && chat.group.myRole !== "member";
    const hiddenBefore = chat.group && chat.hiddenBefore ? Date.parse(chat.hiddenBefore) : null;
    const setMode = useComposerMode((s) => s.set);
    useEffect(() => () => useSpoilers.getState().forget(), [chat.id]);
    const selecting = useSelection((s) => !threadId && s.chatId === chat.id);
    const selectedIds = useSelection((s) => s.ids);
    const startSelection = useSelection((s) => s.start);
    const toggleSelected = useSelection((s) => s.toggle);
    const list = useRef<VListHandle>(null);
    const listFrame = useRef<HTMLDivElement>(null);
    const pickOrder = useRef<string[]>([]);
    const [autoplay, setAutoplay] = useState<string | null>(null);
    const atBottom = useRef(true);
    const [away, setAway] = useState(false);
    const pullFrom = useRef<number | null>(null);
    const [pulled, setPulled] = useState(0);
    const [confirmVanish, setConfirmVanish] = useState(false);
    const viewportSize = useRef(0);
    const initialScrollDone = useRef(false);
    const [menuFor, setMenuFor] = useState<MsgRow | null>(null);
    const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();
    const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
    const [reporting, setReporting] = useState<MessageDTO | null>(null);
    const [timingFor, setTimingFor] = useState<string | null>(null);
    const [markingUp, setMarkingUp] = useState<{ message: MessageDTO; file: File } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<MessageDTO[] | null>(null);
    const [sharing, setSharing] = useState<{ text: string; message: MessageDTO } | null>(null);
    const [noting, setNoting] = useState<{ text: string; message: MessageDTO } | null>(null);
    const look = chatTheme(chat.theme).light;
    const quoteOf = (msg: MessageDTO) => {
      const from = chat.members.find((x) => x.user.id === msg.senderId)?.user;
      return from && { from, sentAt: msg.createdAt, messageId: msg.id };
    };
    const [forwarding, setForwarding] = useState<Hydrated[] | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
    const [album, setAlbum] = useState<{ items: ShownAttachment[]; start: number } | null>(null);
    const [destructFor, setDestructFor] = useState<MessageDTO | null>(null);
    const [packFor, setPackFor] = useState<string | null>(null);
    const [reactFor, setReactFor] = useState<MessageDTO | null>(null);
    const [reactAt, setReactAt] = useState<{ row: MsgRow; anchor: DOMRect } | null>(null);
    const closeReactBar = useCallback(() => setReactAt(null), []);
    const [viewing, setViewing] = useState<(ViewMessageResult & { message: Hydrated }) | null>(null);
    const [opening, setOpening] = useState(false);
    const viewingRef = useRef(viewing);
    viewingRef.current = viewing;
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
        applyEdited(
          qc,
          await hydrate(unwrap(await six.api.POST("/v1/messages/{id}/resend", { params: { path: { id: m.id } } }))),
        );
      } catch {
        void qc.invalidateQueries({ queryKey: ["messages", chat.id] });
      }
    }

    async function openEphemeral(row: MsgRow) {
      const id = row.id;
      if (!id) return;
      if (row.mine && row.message) return setViewing({ message: row.message, expiresAt: null });
      setOpening(true);
      try {
        const result = unwrap(await six.api.POST("/v1/messages/{id}/view", { params: { path: { id } } }));
        setViewing({ ...result, message: await hydrate(result.message) });
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
    const ordered = useMemo(
      () => [...(root ? [root] : []), ...(messages.data?.pages.flatMap((p) => p.items) ?? []).slice().reverse()],
      [messages.data, root],
    );
    const rows = useMemo(() => {
      const built = buildRows(ordered, pending, meId, peerDeliveredAt, peerReadAt, unreadAfter, chat.vanish);
      const at = root ? built.findIndex((r) => r.kind === "msg" && r.id === root.id) : -1;
      if (at >= 0) built.splice(at + 1, 0, { kind: "comments", key: "comments", count: root!.thread?.count ?? 0 });
      const quiet = chat.type === "direct" && !chat.withSupport && !pending.length && ordered.length > 0 && Date.now() - Date.parse(ordered[ordered.length - 1]!.createdAt) > QUIET_FOR_HELLO;
      if (quiet && !root) built.push({ kind: "hello", key: "hello" });
      return built;
    }, [ordered, pending, meId, peerDeliveredAt, peerReadAt, unreadAfter, chat.vanish, chat.type, chat.withSupport, root]);
    useEffect(() => {
      pickOrder.current = rows.flatMap((r) => (r.kind === "msg" && r.message && r.id ? [r.id] : []));
    }, [rows]);
    const firstKey = useRef<string | undefined>(undefined);
    const lastKey = useRef<string | undefined>(undefined);
    const shift = firstKey.current !== undefined && rows[0]?.key !== firstKey.current;

    const scrollToBottom = () => {
      if (rows.length) list.current?.scrollToIndex(rows.length - 1, { align: "end", offset: insetTop + insetBottom + 16 });
    };
    const [jumping, setJumping] = useState<string | null>(null);
    useImperativeHandle(handle, () => ({
      scrollToBottom,
      jumpTo: (id) => {
        setJumping(id);
        void loadUntil(qc, chat.id, id).then((found) => !found && setJumping(null));
      },
    }));

    useEffect(() => {
      const index = jumping ? rowIndex(jumping) : -1;
      if (index < 0) return;
      setJumping(null);
      list.current?.scrollToIndex(index, { align: "center" });
      setHighlight(jumping);
    }, [jumping, rows]);

    const shownInset = useRef(insetTop + insetBottom);
    /**
     * Keeps the last message in view when the header or the footer grows, like when the emoji picker opens: whether we
     * were at the bottom is worked out from where the list was before the change, since a scroll in between can't be trusted.
     */
    useLayoutEffect(() => {
      const grew = insetTop + insetBottom - shownInset.current;
      shownInset.current = insetTop + insetBottom;
      const h = list.current;
      if (!grew || !h) return;
      const below = h.scrollSize - h.scrollOffset - h.viewportSize;
      if (!atBottom.current && below - Math.max(grew, 0) > 80) return;
      atBottom.current = true;
      scrollToBottom();
      const frame = requestAnimationFrame(scrollToBottom);
      return () => cancelAnimationFrame(frame);
    }, [insetTop, insetBottom]);

    useLayoutEffect(() => {
      const appended = rows.length > 0 && rows[rows.length - 1]!.key !== lastKey.current;
      if (!initialScrollDone.current && rows.length) {
        initialScrollDone.current = true;
        scrollToBottom();
      } else if (appended && atBottom.current) {
        scrollToBottom();
      }
      firstKey.current = rows[0]?.key;
      lastKey.current = rows[rows.length - 1]?.key;
    });

    const hasRows = rows.length > 0;
    useEffect(() => {
      if (atBottom.current) scrollToBottom();
    }, [hasRows]);

    useEffect(() => {
      if (atBottom.current) onSeen();
    }, [chat.lastMessage?.id, onSeen]);

    useEffect(() => {
      if (!highlight) return;
      const t = setTimeout(() => setHighlight(null), 1200);
      return () => clearTimeout(t);
    }, [highlight]);

    useEffect(() => {
      const h = list.current;
      if (h && h.viewportSize > 0 && h.scrollSize - h.viewportSize < 300 && messages.hasNextPage && !messages.isFetchingNextPage) {
        void messages.fetchNextPage();
      }
    }, [messages]);

    function onScroll(offset: number) {
      const h = list.current;
      if (!h) return;
      const wasAtBottom = atBottom.current;
      atBottom.current = offset + h.viewportSize >= h.scrollSize - 80;
      if (atBottom.current && !wasAtBottom) onSeen();
      setAway(h.scrollSize - offset - h.viewportSize > h.viewportSize);
      if (offset < 300 && messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
    }

    /** Pulling up past the latest message asks to turn vanish mode on or off, like Instagram. */
    function pullStart(e: React.TouchEvent) {
      const h = list.current;
      const end = !!h && h.scrollSize - h.scrollOffset - h.viewportSize < 2;
      pullFrom.current = chat.type === "direct" && !isBotChat(chat) && !frozen && !threadId && !selecting && end ? e.touches[0]!.clientY : null;
    }

    function pullMove(e: React.TouchEvent) {
      if (pullFrom.current === null) return;
      const next = Math.max(0, pullFrom.current - e.touches[0]!.clientY);
      if (next >= VANISH_PULL && pulled < VANISH_PULL) navigator.vibrate?.(10);
      setPulled(next);
    }

    function pullEnd() {
      if (pulled >= VANISH_PULL) setConfirmVanish(true);
      pullFrom.current = null;
      setPulled(0);
    }

    /** Keeps the last message in view when the list gets shorter, like when the on-screen keyboard opens. */
    function onResize() {
      const size = list.current?.viewportSize ?? 0;
      if (size !== viewportSize.current && atBottom.current) scrollToBottom();
      viewportSize.current = size;
      checkAway();
    }

    /** Whether the latest message is more than a screen below, for the button back to it. */
    function checkAway() {
      const h = list.current;
      setAway(!!h && h.scrollSize - h.scrollOffset - h.viewportSize > h.viewportSize);
    }

    useEffect(checkAway, [rows, chat.id]);

    function rowIndex(id: string) {
      return rows.findIndex((r) => r.kind === "msg" && (r.id === id || !!r.album?.some((it) => it.message?.id === id)));
    }

    /** After a voice message plays to the end, starts the next message if it's a voice message too. */
    function playNext(key: string) {
      const from = rows.findIndex((r) => r.key === key);
      const index = rows.findIndex((r, i) => i > from && r.kind !== "day" && r.kind !== "unread");
      const next = rows[index];
      const voice =
        next?.kind === "msg" &&
        next.attachment?.source === "server" &&
        next.attachment.data.kind === "voice" &&
        !next.deleted &&
        !next.ephemeral;
      if (from < 0 || !voice) return setAutoplay(null);
      setAutoplay(next.key);
      list.current?.scrollToIndex(index, { align: "nearest", smooth: true });
    }

    function jumpTo(id: string) {
      const index = rowIndex(id);
      if (index < 0) return;
      list.current?.scrollToIndex(index, { align: "center", smooth: true });
      setHighlight(id);
    }

    function actionsFor(row: MsgRow): SheetAction[] {
      if (row.pending) {
        const p = row.pending;
        return [
          ...(p.status === "failed" && realtime
            ? [{ label: tr.common.retry, icon: RotateCcw, onSelect: () => void deliver(qc, realtime, p) }]
            : []),
          ...(p.text ? [{ label: tr.common.copy, icon: Copy, onSelect: () => void navigator.clipboard.writeText(p.text).catch(() => null) }] : []),
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
        (m.file?.mime ?? m.attachment.mime) !== "image/gif";
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
          {
            label: tr.messages.removeForMe,
            icon: Trash2,
            destructive: true,
            onSelect: () => void deleteMessage(qc, m, "me").catch(() => null),
          },
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
        ...(frozen || m.ephemeral || m.bump || m.undecryptable || m.type === "service" || !realtime
          ? []
          : [
              {
                label: tr.messages.bump,
                icon: ArrowUp,
                onSelect: () => void queueMessage(qc, realtime, chat.id, { text: "", replyTo: m, bump: true }),
              },
            ]),
        ...(m.ephemeral ||
        m.undecryptable ||
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
        ...(m.type !== "text" || m.ephemeral || m.undecryptable || !shareTargets(m.text).story
          ? []
          : [{ label: tr.messages.shareToStory, icon: CircleFadingPlus, onSelect: () => setSharing({ text: shareTargets(m.text).text, message: m }) }]),
        ...(m.type !== "text" || m.ephemeral || m.undecryptable || !shareTargets(m.text).note
          ? []
          : [{ label: tr.messages.setAsNote, icon: StickyNote, onSelect: () => setNoting({ text: shareTargets(m.text).text, message: m }) }]),
        ...(threadId ? [] : [{ label: tr.common.select, icon: CheckCircle2, onSelect: () => startSelection(chat.id, m.id) }]),
        ...(frozen || m.ephemeral || m.undecryptable || m.type === "service"
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
        ...(m.ephemeral && canResend(m.ephemeral)
          ? [{ label: tr.messages.resendAgain, icon: RotateCcw, onSelect: () => void resendEphemeral(m) }]
          : []),
        ...(!m.ephemeral &&
        row.mine &&
        !["sticker", "location", "checklist", "poll", "game"].includes(m.type) &&
        !frozen &&
        !m.undecryptable
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
        ...(!m.ephemeral && row.mine && !frozen && !["sticker", "checklist", "poll", "game"].includes(m.type)
          ? [{ label: tr.messages.makeSelfDestruct, icon: Flame, onSelect: () => setDestructFor(m) }]
          : []),
        { label: tr.messages.timing, icon: Info, onSelect: () => setTimingFor(m.id) },
        ...(row.mine ? [] : [{ label: tr.common.report, icon: Flag, onSelect: () => setReporting(m) }]),
        {
          label: tr.common.delete,
          icon: Trash2,
          destructive: true,
          onSelect: () => setConfirmDelete(row.album?.flatMap((it) => (it.message ? [it.message] : [])) ?? [m]),
        },
      ];
    }

    if (messages.isPending) {
      return <div className="grid flex-1 place-items-center text-sm text-stone-500">{tr.common.loading}</div>;
    }

    return (
      <MyMention.Provider value={myMention}>
      <div
        ref={listFrame}
        onTouchStart={pullStart}
        onTouchMove={pullMove}
        onTouchEnd={pullEnd}
        onTouchCancel={pullEnd}
        className="flex min-h-0 flex-1 flex-col justify-end"
      >
        {pulled > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
            style={{ bottom: insetBottom + 12, opacity: Math.min(1, pulled / VANISH_PULL) }}
          >
            <span
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                pulled >= VANISH_PULL ? "bg-brand text-brand-ink" : "bg-black/60 text-white backdrop-blur-sm"
              }`}
            >
              <Ghost className="size-4" />
              {chat.vanish ? tr.composer.turnOffVanish : tr.composer.turnOnVanish}
            </span>
          </div>
        )}
        {away && (
          <button
            type="button"
            onClick={() => rows.length && list.current?.scrollToIndex(rows.length - 1, { align: "end", offset: insetTop + insetBottom + 16, smooth: true })}
            aria-label={tr.messages.latest}
            title={tr.messages.latest}
            className="absolute right-3 z-10 grid size-11 place-items-center rounded-full bg-white text-stone-700 shadow-lg ring-1 ring-black/5 dark:bg-stone-800 dark:text-stone-200 dark:ring-white/10"
            style={{ bottom: insetBottom + 12 }}
          >
            <ChevronDown className="size-6" />
            {chat.unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">
                {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
              </span>
            )}
          </button>
        )}
        {rows.length === 0 && (
          <div className="flex flex-col items-center pb-8 text-center text-sm">
            <span className="rounded-full bg-black/25 px-4 py-1.5 text-white backdrop-blur-sm">
              {chat.withSupport ? tr.support.welcome : tr.messages.empty}
            </span>
            {!chat.withSupport && <HelloGif chatId={chat.id} />}
          </div>
        )}
        {messages.isFetchingNextPage && (
          <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center" style={{ top: insetTop + 8 }}>
            <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-ink shadow-md">
              <Loader2 className="size-4 animate-spin" />
            </span>
          </div>
        )}
        <VList
          ref={list}
          data={rows}
          shift={shift}
          onScroll={onScroll}
          onResize={onResize}
          className="overscroll-contain"
          style={{
            height: "auto",
            maxHeight: "100%",
            contain: "content",
            paddingTop: insetTop + 8,
            paddingBottom: insetBottom + 8,
          }}
        >
          {(row) =>
            row.kind === "day" ? (
              <div key={row.key} className="flex justify-center py-3">
                <span className="rounded-full bg-black/25 px-3 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  {dayLabel(row.at)}
                </span>
              </div>
            ) : row.kind === "comments" ? (
              <div key={row.key} className="flex items-center gap-3 px-4 py-3">
                <span className="h-px flex-1 bg-black/15 dark:bg-white/15" />
                <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {row.count ? tr.groups.comments(row.count) : tr.groups.noComments}
                </span>
                <span className="h-px flex-1 bg-black/15 dark:bg-white/15" />
              </div>
            ) : row.kind === "hello" ? (
              <div key={row.key} className="flex justify-center pb-3">
                <HelloGif chatId={chat.id} />
              </div>
            ) : row.kind === "unread" ? (
              <div key={row.key} className="flex justify-center py-2">
                <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white backdrop-blur-sm">
                  {tr.messages.unread}
                </span>
              </div>
            ) : row.kind === "service" ? (
              <div key={row.key} className="flex justify-center px-6 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-center text-xs text-white backdrop-blur-sm">
                  <ServiceIcon action={row.message.action} />
                  {row.message.action?.type === "call"
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
                  {row.message.action?.type === "live_invite" && !row.message.action.ended && (
                    <Link href={`/play/${row.message.action.roomId}`} className="ml-1 font-semibold underline underline-offset-2">
                      {tr.live.join}
                    </Link>
                  )}
                </span>
              </div>
            ) : (
              <Bubble
                key={row.key}
                row={row}
                sender={senderOf(row)}
                highlighted={row.id !== null && row.id === highlight}
                selecting={selecting}
                selected={row.id !== null && selecting && selectedIds.includes(row.id)}
                nameOf={nameOf}
                onMenu={(at, rect) => {
                  setMenuFor(row);
                  setMenuAt(at);
                  setMenuRect(rect ?? null);
                }}
                onReply={() => row.message && setMode(slot, { kind: "reply", message: row.message })}
                onQuote={jumpTo}
                onToggle={() => row.id && toggleSelected(row.id)}
                onDragPick={(mouse) =>
                  row.id &&
                  listFrame.current &&
                  dragSelect({
                    anchor: row.id,
                    mouse,
                    order: () => pickOrder.current,
                    frame: listFrame.current,
                    scrollBy: (dy) => list.current?.scrollBy(dy),
                  })
                }
                onOpen={setLightbox}
                onOpenEphemeral={() => void openEphemeral(row)}
                onResend={() => row.message && void resendEphemeral(row.message)}
                onOpenPack={setPackFor}
                meId={meId}
                onReact={(emoji) => !frozen && row.message && void react(qc, row.message, meId, emoji)}
                onCheck={(item) => row.message && void check(qc, row.message, meId, item)}
                onVote={(option) => row.message && void vote(qc, row.message, meId, option)}
                onPlay={(move) => row.message && void play(qc, row.message, meId, move)}
                onSendGame={(game) =>
                  isBotChat(chat) && isBotGame(game.game)
                    ? startBotGame(qc, game.game)
                    : realtime && void queueMessage(qc, realtime, chat.id, { text: "", game })
                }
                onOpenAlbum={(items, start) => setAlbum({ items, start })}
                safe={chat.safeView}
                frozen={frozen}
                gamesOnly={isAppChat(chat)}
                onReactButton={(anchor) => setReactAt({ row, anchor })}
                autoPlay={autoplay === row.key}
                onVoiceStop={(finished) => (finished ? playNext(row.key) : setAutoplay((k) => (k === row.key ? null : k)))}
                comments={!threadId && chat.group ? (row.message?.thread ?? null) : null}
                onOpenThread={() => row.message && onOpenThread?.(row.message)}
                quoteEarlier={!!row.replyTo && hiddenBefore !== null && Date.parse(row.replyTo.sentAt) <= hiddenBefore}
              />
            )
          }
        </VList>

        {menuFor && (
          <MessageMenu
            rect={menuRect}
            mine={menuFor.mine}
            actions={actionsFor(menuFor)}
            at={menuAt}
            onClose={() => setMenuFor(null)}
          >
            {!frozen && canReact(menuFor) && (
              <div className="rounded-full bg-white/70 backdrop-blur-xl backdrop-saturate-150 px-1.5 py-1 shadow-xl ring-1 ring-black/5 dark:bg-stone-900/70 dark:ring-white/10">
                <ReactionBar
                  message={menuFor.message!}
                  meId={meId}
                  onReact={(emoji) => {
                    setMenuFor(null);
                    void react(qc, menuFor.message!, meId, emoji);
                  }}
                  onMore={() => {
                    setMenuFor(null);
                    setReactFor(menuFor.message);
                  }}
                />
              </div>
            )}
          </MessageMenu>
        )}
        {reactAt && (
          <ReactionPopover
            anchor={reactAt.anchor}
            alignEnd={reactAt.row.mine}
            message={reactAt.row.message!}
            meId={meId}
            onReact={(emoji) => {
              setReactAt(null);
              void react(qc, reactAt.row.message!, meId, emoji);
            }}
            onMore={() => {
              setReactAt(null);
              setReactFor(reactAt.row.message);
            }}
            onClose={closeReactBar}
          />
        )}
        {reactFor && (
          <ReactionPicker
            media
            onPick={(emoji, media) => void react(qc, reactFor, meId, emoji, media)}
            onClose={() => setReactFor(null)}
          />
        )}
        {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
        {album && <AlbumViewer items={album.items} start={album.start} onClose={() => setAlbum(null)} />}
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
        {reporting && (
          <ReportDialog
            target={{ messageId: reporting.id }}
            title={tr.messages.reportMessage}
            onClose={() => setReporting(null)}
          />
        )}
        {packFor && <PackDialog packId={packFor} onClose={() => setPackFor(null)} />}
        {timingFor && <MessageTiming messageId={timingFor} onClose={() => setTimingFor(null)} />}
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
      </div>
      </MyMention.Provider>
    );
  },
);
