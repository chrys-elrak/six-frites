"use client";

import { unwrap } from "@six/sdk";
import {
  type NoteDTO,
  type GifDTO,
  type PublicUser,
  STORY_BACKGROUNDS,
  STORY_REACTIONS,
  STORY_SHOW_MS,
  STORY_STICKERS,
  angleOf,
  turned,
  ASK_COLORS,
  doodleTileSvg,
  stickerIndex,
  STORY_STICKER_SCALE,
  type StoryDTO,
  type StoryGroupDTO,
  type StoryLocation,
  chatTheme,
  coordsLabel,
  countReactions,
  mapsUrl,
  storyBackground,
  type StoryPositions,
  type StoryReaction,
  type StorySpot,
  type StoryAsk,
  type StoryLink,
  askUrl,
  type StorySticker,
} from "@six/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  MoveDiagonal2,
  Pause,
  Play,
  Plus,
  SendHorizontal,
  Trash2,
  VenetianMask,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCloseOnBack } from "@/lib/back";
import { clockTime, shortDate, timeAgo } from "@/lib/format";
import { useChats } from "@/lib/chats";
import { dragAndPinch } from "@/lib/drag-pinch";
import { useT } from "@/lib/i18n";
import { toastSent } from "@/lib/notify";
import { useRealtime } from "@/lib/realtime";
import { queueMessage } from "@/lib/send";
import { useHiddenByArchive } from "@/lib/archive-lock";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { GifSearch } from "./gif-picker";
import { FloatingReactions, useFloaters } from "./floating-reactions";
import { NoteBubble, NoteEditor, NoteReader, useNotes } from "./notes";
import { Portal } from "./portal";
import { StoryDrawingLayer } from "./story-drawing";
import { Sheet } from "./sheet";
import { StoryComposer } from "./story-composer";

export const storiesKey = ["stories"] as const;

const live = (s: StoryDTO) => Date.parse(s.expiresAt) > Date.now();

export function useStories() {
  return useQuery({
    queryKey: storiesKey,
    queryFn: async () => unwrap(await six.api.GET("/v1/stories")).items,
    select: (groups) =>
      groups.map((g) => ({ ...g, stories: g.stories.filter(live) })).filter((g) => g.stories.length > 0),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** The header of an anonymous message's card, as in the inbox: its gradient under the chat wallpaper's doodles. */
const ASK_HEAD = `url("data:image/svg+xml,${encodeURIComponent(doodleTileSvg("#ffffff", 0.3, 150))}"), linear-gradient(135deg, ${ASK_COLORS[0][0]}, ${ASK_COLORS[0][1]})`;

const askPill = "flex max-w-72 items-center gap-2 rounded-2xl px-4 py-3 text-base leading-snug font-bold break-words text-white shadow-lg";

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const clampScale = (v: number) => Math.min(STORY_STICKER_SCALE.max, Math.max(STORY_STICKER_SCALE.min, v));

/** Follows the pointer until it lets go, wherever it goes on the page. */
function follow(move: (e: PointerEvent) => void, done?: (e: PointerEvent) => void) {
  const end = (e: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    done?.(e);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/**
 * A story's GIF, place, date and time. With `placed` it draws the ones the poster dragged somewhere, at their spot
 * and size (inside an `absolute inset-0` layer); without, the others in a row at the bottom. In the composer,
 * `onMove` lets each be dragged anywhere on `frame` (the whole story card) and resized by its corner handle or a pinch,
 * `onRemove` adds a button to take it off, and `onTap` is called when it is tapped rather than dragged.
 */
export function StoryStickers({
  asks,
  gifs,
  link,
  askLink,
  askText = null,
  location,
  showDate,
  showTime,
  at,
  positions,
  placed,
  frame,
  onMove,
  onRemove,
  onTap,
  skip,
  photos = [],
}: {
  asks: StoryAsk[];
  gifs: React.ReactNode[];
  /** Photos placed like stickers while composing; they end up drawn into the story's picture. */
  photos?: React.ReactNode[];
  /** Leaves these stickers out, as when the story is drawn into a picture without the ones that stay live. */
  skip?: (sticker: StorySticker) => boolean;
  link: StoryLink | null;
  /** The poster's anonymous link, when the story invites anonymous messages. */
  askLink: string | null;
  /** What the anonymous link sticker says instead of the app's line. */
  askText?: string | null;
  location: StoryLocation | null;
  showDate: boolean;
  showTime: boolean;
  at: string;
  positions: StoryPositions;
  placed: boolean;
  frame?: React.RefObject<HTMLElement | null>;
  onMove?: (sticker: StorySticker, spot: StorySpot) => void;
  onRemove?: (sticker: StorySticker) => void;
  onTap?: (sticker: StorySticker) => void;
}) {
  const tr = useT();
  const chip = "flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-stone-900 shadow";
  const has = (k: StorySticker) =>
    stickerIndex("ask", k) >= 0
      ? stickerIndex("ask", k) < asks.length
      : stickerIndex("gif", k) >= 0
        ? stickerIndex("gif", k) < gifs.length
        : stickerIndex("photo", k) >= 0
          ? stickerIndex("photo", k) < photos.length
          : { location: !!location, date: showDate, time: showTime, link: !!link, asklink: !!askLink }[k as "link"];
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const shown = STORY_STICKERS.filter((k) => has(k) && !!positions[k] === placed && !skip?.(k));
  if (!shown.length) return null;
  const editing = !!onMove && !!frame;

  const centreOf = (el: HTMLElement, box: DOMRect) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: (r.left + r.width / 2 - box.left) / box.width, y: (r.top + r.height / 2 - box.top) / box.height };
  };

  const drag = (sticker: StorySticker) => (e: React.PointerEvent<HTMLElement>) => {
    const box = frame?.current?.getBoundingClientRect();
    if (!onMove || !box) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = centreOf(e.currentTarget, box);
    dragAndPinch(
      e,
      box,
      { x, y, scale: positions[sticker]?.scale ?? 1, rotate: positions[sticker]?.rotate },
      (spot) => onMove(sticker, spot),
      (moved) => !moved && onTap?.(sticker),
    );
  };

  const resize = (sticker: StorySticker) => (e: React.PointerEvent<HTMLElement>) => {
    const box = frame?.current?.getBoundingClientRect();
    const el = e.currentTarget.parentElement;
    if (!onMove || !box || !el) return;
    e.preventDefault();
    e.stopPropagation();
    const { cx, cy, x, y } = centreOf(el, box);
    const from = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    const { scale = 1, rotate = 0 } = positions[sticker] ?? {};
    const centre = { x: cx, y: cy };
    const a0 = angleOf(centre, { x: e.clientX, y: e.clientY });
    follow((ev) =>
      onMove(sticker, {
        x,
        y,
        scale: clampScale((scale * Math.hypot(ev.clientX - cx, ev.clientY - cy)) / from),
        rotate: turned(rotate + angleOf(centre, { x: ev.clientX, y: ev.clientY }) - a0),
      }),
    );
  };

  const node = (k: StorySticker, ask = asks[stickerIndex("ask", k)]) =>
    ask ? (
      <div className="w-64 overflow-hidden rounded-3xl bg-white text-center shadow-lg">
        <p className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundImage: ASK_HEAD }}>
          <Logo className="size-5 shrink-0" />
          {ask.prompt ?? tr.ask.prompt}
        </p>
        {ask.photoUrl && <img src={ask.photoUrl} alt="" draggable={false} className="max-h-72 w-full object-cover" />}
        {ask.gif && <video src={ask.gif.url} autoPlay loop muted playsInline className="max-h-72 w-full object-cover" />}
        {ask.text.trim() && (
          <p className="px-4 pt-5 pb-4 text-lg leading-snug font-bold break-words whitespace-pre-wrap text-stone-900">{ask.text}</p>
        )}
      </div>
    ) : stickerIndex("gif", k) >= 0 ? (
      gifs[stickerIndex("gif", k)]
    ) : stickerIndex("photo", k) >= 0 ? (
      photos[stickerIndex("photo", k)]
    ) : k === "link" && link ? (
      editing ? (
        <span className={`${chip} text-sky-700`}>
          <Link2 className="size-4" />
          <span className="max-w-48 truncate">{link.label || hostOf(link.url)}</span>
        </span>
      ) : (
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className={`${chip} text-sky-700`} onPointerDown={stop}>
          <Link2 className="size-4" />
          <span className="max-w-48 truncate">{link.label || hostOf(link.url)}</span>
        </a>
      )
    ) : k === "asklink" && askLink ? (
      editing ? (
        <span className={askPill} style={{ backgroundImage: ASK_HEAD }}>
          <VenetianMask className="size-5 shrink-0" />
          {askText || tr.ask.prompt}
        </span>
      ) : (
        <a href={askLink} target="_blank" rel="noopener noreferrer" className={askPill} style={{ backgroundImage: ASK_HEAD }} onPointerDown={stop}>
          <VenetianMask className="size-5 shrink-0" />
          {askText || tr.ask.prompt}
        </a>
      )
    ) : k === "location" && location ? (
      editing ? (
        <span className={chip}>
          <MapPin className="size-4 text-rose-600" />
          <span className="max-w-48 truncate">{location.name ?? coordsLabel(location)}</span>
        </span>
      ) : (
        <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer" className={chip} onPointerDown={stop}>
          <MapPin className="size-4 text-rose-600" />
          <span className="max-w-48 truncate">{location.name ?? coordsLabel(location)}</span>
        </a>
      )
    ) : k === "date" ? (
      <span className={chip}>
        <CalendarDays className="size-4 text-brand" />
        {shortDate(at)}
      </span>
    ) : (
      <span className={chip}>
        <Clock className="size-4 text-brand" />
        {clockTime(at)}
      </span>
    );

  const handles = (k: StorySticker) => {
    if (!editing) return null;
    const keep = { transform: `scale(${1 / (positions[k]?.scale ?? 1)})` };
    const handle = "absolute grid size-6 place-items-center rounded-full bg-white text-stone-900 shadow ring-1 ring-black/10 touch-none";
    return (
      <>
        {onRemove && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(k)}
            aria-label={tr.common.remove}
            title={tr.common.remove}
            style={keep}
            className={`${handle} -top-2.5 -left-2.5`}
          >
            <X className="size-3.5" strokeWidth={3} />
          </button>
        )}
        <span onPointerDown={resize(k)} aria-hidden style={keep} className={`${handle} -right-2.5 -bottom-2.5 cursor-nwse-resize`}>
          <MoveDiagonal2 className="size-3.5" strokeWidth={2.5} />
        </span>
      </>
    );
  };
  const grab = editing ? "pointer-events-auto touch-none cursor-grab select-none active:cursor-grabbing" : "pointer-events-auto";

  if (placed) {
    return shown.map((k) => (
      <div
        key={k}
        data-pinch={editing ? `sticker:${k}` : undefined}
        onPointerDown={drag(k)}
        className={`absolute ${grab}`}
        style={{
          zIndex: positions[k]!.z,
          left: `${positions[k]!.x * 100}%`,
          top: `${positions[k]!.y * 100}%`,
          transform: `translate(-50%, -50%) scale(${positions[k]!.scale ?? 1}) rotate(${positions[k]!.rotate ?? 0}deg)`,
        }}
      >
        {node(k)}
        {handles(k)}
      </div>
    ));
  }
  const big = (k: StorySticker) => stickerIndex("ask", k) >= 0 || stickerIndex("gif", k) >= 0 || stickerIndex("photo", k) >= 0;
  const chips = shown.filter((k) => !big(k));
  return (
    <>
      {shown.filter(big).map((k) => (
        <div key={k} data-pinch={editing ? `sticker:${k}` : undefined} onPointerDown={drag(k)} className={`relative ${grab}`}>
          {node(k)}
          {handles(k)}
        </div>
      ))}
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {chips.map((k) => (
            <div key={k} data-pinch={editing ? `sticker:${k}` : undefined} onPointerDown={drag(k)} className={`relative ${grab}`}>
              {node(k)}
              {handles(k)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * A chat message's copy of the story or note it answers: while that's still up, tapping it opens it right there,
 * the story in the viewer, a contact's note to read, or my own note to edit.
 */
export function StoryReplyLink({ id, note, children }: { id: string; note: boolean; children: React.ReactNode }) {
  const tr = useT();
  const groups = useStories().data ?? [];
  const notes = useNotes().data;
  const [open, setOpen] = useState(false);
  const at = note ? -1 : groups.findIndex((g) => g.stories.some((s) => s.id === id));
  const theirs = note ? notes?.items.find((n) => n.note.id === id) : undefined;
  const mine = note && notes?.mine?.id === id ? notes.mine : null;
  if (at < 0 && !theirs && !mine) return children;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const close = () => setOpen(false);
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={note ? tr.stories.openNote : tr.stories.openStory}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="block cursor-pointer"
      >
        {children}
      </span>
      {open && (
        <span className="contents" onClick={stop} onPointerDown={stop} onPointerUp={stop} onContextMenu={stop} onKeyDown={stop}>
          {at >= 0 ? (
            <StoryViewer groups={groups} start={at} storyId={id} onClose={close} />
          ) : theirs ? (
            <NoteReader user={theirs.user} note={theirs.note} onClose={close} />
          ) : (
            <NoteEditor note={mine} onClose={close} />
          )}
        </span>
      )}
    </>
  );
}

function Ring({ unseen, children }: { unseen: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full p-[3px] ${
        unseen ? "bg-gradient-to-tr from-amber-400 via-brand to-rose-500" : "bg-stone-300 dark:bg-stone-700"
      }`}
    >
      <span className="rounded-full bg-stone-50 p-[2px] dark:bg-stone-950">{children}</span>
    </span>
  );
}

/**
 * A chat's avatar, ringed while that person has stories up: orange until you've seen them all. Tapping the ring
 * opens their stories rather than the chat around it.
 */
export function StoryAvatar({ userId, name, children }: { userId: string; name: string; children: React.ReactNode }) {
  const tr = useT();
  const groups = useStories().data ?? [];
  const at = groups.findIndex((g) => g.user.id === userId);
  const [open, setOpen] = useState(false);
  if (at < 0) return children;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const unseen = groups[at]!.stories.some((s) => !s.seen);
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={tr.stories.open(name)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`block rounded-full ring-[2.5px] ring-offset-2 ring-offset-stone-50 dark:ring-offset-stone-950 ${unseen ? "ring-brand" : "ring-stone-300 dark:ring-stone-600"}`}
      >
        {children}
      </span>
      {open && (
        <span className="contents" onClick={stop} onPointerDown={stop} onPointerUp={stop} onContextMenu={stop} onKeyDown={stop}>
          <StoryViewer groups={groups} start={at} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}

/**
 * A row of contacts' stories and notes above the chats, starting with mine, a button to add a story and my note.
 * Tapping a picture opens that person's stories, or their note when they only have a note.
 */
export function StoriesBar() {
  const tr = useT();
  const me = useSession((s) => s.user!);
  const stories = useStories();
  const notes = useNotes().data;
  const [open, setOpen] = useState<number | null>(null);
  const linked = useSearchParams().get("story") ?? undefined;
  const router = useRouter();
  const pathname = usePathname();
  const [composing, setComposing] = useState(false);
  const [writingNote, setWritingNote] = useState(false);
  const [reading, setReading] = useState<{ user: PublicUser; note: NoteDTO } | null>(null);
  const hidden = useHiddenByArchive().userIds;
  const groups = (stories.data ?? []).filter((g) => !hidden.has(g.user.id));
  const linkedAt = linked ? groups.findIndex((g) => g.stories.some((s) => s.id === linked)) : -1;
  useEffect(() => {
    if (linkedAt >= 0) setOpen(linkedAt);
  }, [linkedAt]);
  const close = () => {
    setOpen(null);
    if (linked) router.replace(pathname);
  };
  const noteItems = (notes?.items ?? []).filter((n) => !hidden.has(n.user.id));
  const mineAt = groups.findIndex((g) => g.user.id === me.id);
  const latest = groups[mineAt]?.stories[groups[mineAt]!.stories.length - 1];
  const cover = latest && (latest.media?.thumbUrl ?? (latest.type === "image" ? latest.media?.url : null));
  const noteOf = new Map(noteItems.map((n) => [n.user.id, n]));
  const people = [
    ...groups.flatMap((g, i) => (g.user.id === me.id ? [] : [{ user: g.user, at: i as number | null, unseen: g.stories.some((s) => !s.seen) }])),
    ...noteItems.filter((n) => !groups.some((g) => g.user.id === n.user.id)).map((n) => ({ user: n.user, at: null, unseen: false })),
  ];
  const slot = "flex h-9 items-end justify-center";

  return (
    <>
      <div role="list" aria-label={tr.stories.title} className="-mx-4 flex w-[calc(100%+2rem)] gap-4 overflow-x-auto px-4 pb-1">
        <div role="listitem" className="relative flex w-16 shrink-0 flex-col items-center gap-1">
          <div className={slot}>
            <NoteBubble
              note={notes?.mine ?? null}
              placeholder={tr.stories.leaveNote}
              label={notes?.mine ? tr.stories.yourNote : tr.stories.leaveNote}
              onClick={() => setWritingNote(true)}
            />
          </div>
          <button
            type="button"
            onClick={() => (mineAt >= 0 ? setOpen(mineAt) : setComposing(true))}
            aria-label={mineAt >= 0 ? tr.stories.open(tr.stories.yours) : tr.stories.add}
          >
            <Ring unseen={false}>
              {cover ? (
                <img src={cover} alt="" className="size-14 rounded-full object-cover" />
              ) : latest ? (
                <span className="block size-14 rounded-full" style={{ background: storyBackground(latest.background ?? "#eb8a00") }} />
              ) : (
                <Avatar user={me} size="md" />
              )}
            </Ring>
          </button>
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label={tr.stories.add}
            title={tr.stories.add}
            className="absolute top-[5.25rem] right-0 grid size-6 place-items-center rounded-full bg-brand text-brand-ink ring-2 ring-stone-50 dark:ring-stone-950"
          >
            <Plus className="size-4" strokeWidth={3} />
          </button>
          <span className="w-full truncate text-center text-xs text-stone-500">{tr.stories.yours}</span>
        </div>
        {people.map(({ user, at, unseen }) => {
          const note = noteOf.get(user.id);
          return (
            <div key={user.id} role="listitem" className="flex w-16 shrink-0 flex-col items-center gap-1">
              <div className={slot}>
                {note && <NoteBubble note={note.note} label={tr.stories.noteBy(user.displayName)} onClick={() => setReading(note)} />}
              </div>
              <button
                type="button"
                onClick={() => (at !== null ? setOpen(at) : note && setReading(note))}
                aria-label={at !== null ? tr.stories.open(user.displayName) : tr.stories.noteBy(user.displayName)}
              >
                {at !== null ? (
                  <Ring unseen={unseen}>
                    <Avatar user={user} size="md" />
                  </Ring>
                ) : (
                  <span className="block p-[5px]">
                    <Avatar user={user} size="md" />
                  </span>
                )}
              </button>
              <span className="w-full truncate text-center text-xs">{user.displayName}</span>
            </div>
          );
        })}
      </div>
      {open !== null && groups[open] && <StoryViewer groups={groups} start={open} storyId={linked} viewers={!!linked} onClose={close} />}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
      {writingNote && <NoteEditor note={notes?.mine ?? null} onClose={() => setWritingNote(false)} />}
      {reading && <NoteReader user={reading.user} note={reading.note} onClose={() => setReading(null)} />}
    </>
  );
}

function Viewers({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const tr = useT();
  const viewers = useQuery({
    queryKey: ["stories", storyId, "viewers"],
    queryFn: async () => unwrap(await six.api.GET("/v1/stories/{id}/viewers", { params: { path: { id: storyId } } })).items,
  });
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 max-h-[60%] overflow-y-auto rounded-t-3xl bg-stone-900/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mb-2 flex items-center">
        <h3 className="flex-1 font-semibold">{tr.stories.views(viewers.data?.length ?? 0)}</h3>
        <button type="button" onClick={onClose} aria-label={tr.common.close} className="grid size-9 place-items-center rounded-full hover:bg-white/10">
          <X className="size-5" />
        </button>
      </div>
      {viewers.isPending && <p className="text-sm text-white/60">{tr.common.loading}</p>}
      {viewers.data?.length === 0 && <p className="text-sm text-white/60">{tr.stories.noViews}</p>}
      {viewers.data?.map((v) => (
        <div key={v.user.id} className="flex items-center gap-3 py-2">
          <Avatar user={v.user} />
          <span className="min-w-0 flex-1 truncate">{v.user.displayName}</span>
          <span className="text-xs text-white/60">{timeAgo(v.viewedAt)}</span>
          {countReactions(v.reactions).map(([emoji, n]) => (
            <span key={emoji} className="flex items-baseline text-xl leading-none">
              {emoji}
              {n > 1 && <span className="text-xs font-semibold text-white/70">{n}</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Opens the first story in a group the viewer hasn't seen yet, or the first one when all were seen. */
const firstUnseen = (g: StoryGroupDTO) => Math.max(0, g.stories.findIndex((s) => !s.seen));

/** Answers someone's story: a quick reaction they see in who opened it, or a few words in your chat with them. */
function ReplyBar({ story, owner, onTyping }: { story: StoryDTO; owner: PublicUser; onTyping: (typing: boolean) => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const { realtime } = useRealtime();
  const chats = [...(useChats().data ?? []), ...(useChats(true).data ?? [])];
  const chat = chats.find((c) => c.type === "direct" && c.members.some((m) => m.user.id === owner.id));
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [pickingGif, setPickingGif] = useState(false);
  const [popped, setPopped] = useState({ emoji: "", n: 0 });
  const [floaters, float] = useFloaters();
  if (!chat || !realtime) return null;

  const done = () => {
    setSent(true);
    setTimeout(() => setSent(false), 1500);
  };
  const react = (emoji: StoryReaction) => {
    void six.api.POST("/v1/stories/{id}/react", { params: { path: { id: story.id } }, body: { emoji } });
    setPopped((p) => ({ emoji, n: p.n + 1 }));
    float(emoji);
  };
  const pickGif = (on: boolean) => {
    setPickingGif(on);
    onTyping(on);
  };
  const send = (reply: string, gif?: GifDTO) => {
    if (!reply.trim() && !gif) return;
    const reference = {
      id: story.id,
      ownerId: owner.id,
      kind: story.type,
      text: story.text?.slice(0, 120) ?? null,
      background: story.background,
      imageUrl: story.media?.thumbUrl ?? (story.type === "image" ? story.media?.url : null) ?? null,
    };
    if (reply.trim()) void queueMessage(qc, realtime, chat.id, { text: reply.trim(), story: reference });
    if (gif) void queueMessage(qc, realtime, chat.id, { text: "", gif, story: reference });
    toastSent(chat.id, owner, reply.trim() || tr.stories.gif);
    setText("");
    pickGif(false);
    done();
  };

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <FloatingReactions reactions={floaters} />
      <div className="flex justify-center gap-1">
        {sent ? (
          <span className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-stone-900">{tr.stories.sent}</span>
        ) : (
          STORY_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              aria-label={emoji}
              className="grid size-10 place-items-center rounded-full text-2xl transition hover:scale-125 active:scale-95"
            >
              <span key={popped.emoji === emoji ? popped.n : 0} className={popped.emoji === emoji ? "piece-pop" : undefined}>
                {emoji}
              </span>
            </button>
          ))
        )}
      </div>
      {pickingGif && (
        <div className="max-h-[45vh] overflow-y-auto rounded-2xl bg-white p-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100">
          <GifSearch onPick={(g) => send(text, g)} />
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
          maxLength={4000}
          placeholder={tr.stories.replyTo(owner.displayName)}
          aria-label={tr.stories.replyTo(owner.displayName)}
          className="min-w-0 flex-1 rounded-full border border-white/60 bg-black/20 px-4 py-2.5 text-[16px] text-white outline-none backdrop-blur placeholder:text-white/70 focus:border-white"
        />
        <button
          type="button"
          aria-pressed={pickingGif}
          onClick={() => pickGif(!pickingGif)}
          className={`shrink-0 rounded-full px-3 py-2.5 text-sm font-bold backdrop-blur ${pickingGif ? "bg-white text-stone-900" : "border border-white/60 bg-black/20 text-white"}`}
        >
          {tr.stories.gif}
        </button>
        {text.trim() && (
          <button type="submit" aria-label={tr.common.send} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
            <SendHorizontal className="size-5" />
          </button>
        )}
      </form>
    </div>
  );
}

/**
 * Full-screen stories, one person after the other. Tap the right side for the next story, the left
 * for the previous one, and hold to pause.
 */
export function StoryViewer({
  groups,
  start,
  storyId,
  viewers = false,
  onClose,
}: {
  groups: StoryGroupDTO[];
  start: number;
  storyId?: string;
  viewers?: boolean;
  onClose: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const meId = useSession((s) => s.user!.id);
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => {
    const at = groups[start]!.stories.findIndex((s) => s.id === storyId);
    return at >= 0 ? at : firstUnseen(groups[start]!);
  });
  const [elapsed, setElapsed] = useState(0);
  const progress = useRef(0);
  const show = useCallback((ms: number) => {
    progress.current = ms;
    setElapsed(ms);
  }, []);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [showViewers, setShowViewers] = useState(viewers);
  const [deleting, setDeleting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [videoMs, setVideoMs] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const downAt = useRef(0);
  const group = groups[gi];
  const story = group?.stories[si];
  const mine = group?.user.id === meId;
  const [shownId, setShownId] = useState<string | null>(null);
  const imageLoading = story?.type === "image" && !!story.media?.url && shownId !== story.id;
  const loading = imageLoading || (story?.type === "video" && !!story.media?.url && videoMs === null);
  const stopped = paused || held || showViewers || deleting || replying || imageLoading;
  const length = story?.type === "video" ? (videoMs ?? Infinity) : STORY_SHOW_MS;

  const go = useCallback(
    (step: 1 | -1) => {
      show(0);
      setVideoMs(null);
      setShowViewers(false);
      const g = groups[gi]!;
      if (step === 1 && si < g.stories.length - 1) return setSi(si + 1);
      if (step === -1 && si > 0) return setSi(si - 1);
      const next = gi + step;
      if (next < 0) return;
      if (next >= groups.length) return onClose();
      setGi(next);
      setSi(step === 1 ? firstUnseen(groups[next]!) : groups[next]!.stories.length - 1);
    },
    [groups, gi, si, onClose, show],
  );

  useEffect(() => {
    if (!story || story.seen || mine) return;
    void six.api.POST("/v1/stories/{id}/view", { params: { path: { id: story.id } } });
    qc.setQueryData<StoryGroupDTO[]>(storiesKey, (old) =>
      old?.map((g) => ({ ...g, stories: g.stories.map((s) => (s.id === story.id ? { ...s, seen: true } : s)) })),
    );
  }, [story, mine, qc]);

  useEffect(() => {
    if (stopped || story?.type === "video") return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const ms = progress.current + now - last;
      last = now;
      if (ms >= STORY_SHOW_MS) go(1);
      else show(ms);
    }, 50);
    return () => clearInterval(timer);
  }, [stopped, story, go, show]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (stopped) v.pause();
    else void v.play().catch(() => undefined);
  }, [stopped, story]);

  useCloseOnBack(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!group || !story) return null;

  async function remove() {
    await six.api.DELETE("/v1/stories/{id}", { params: { path: { id: story!.id } } });
    void qc.invalidateQueries({ queryKey: storiesKey });
    if (group!.stories.length === 1) onClose();
    else go(si === group!.stories.length - 1 ? -1 : 1);
  }

  const media = story.media;
  const stickers = {
    asks: story.asks ?? [],
    gifs: (story.gifs ?? []).map((g) => <video key={g.url} src={g.url} autoPlay loop muted playsInline className="max-h-40 max-w-56 rounded-xl" />),
    link: story.link ?? null,
    askLink: story.askCode ? askUrl(window.location.origin, story.askCode) : null,
    askText: story.askText ?? null,
    location: story.location,
    showDate: story.showDate,
    showTime: story.showTime,
    at: story.createdAt,
    positions: story.positions ?? {},
  };
  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white" role="dialog" aria-modal aria-label={tr.stories.title}>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={tr.stories.previous}
          className="mr-4 hidden size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 md:grid"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="relative flex h-full w-full flex-col overflow-hidden md:h-[min(92vh,52rem)] md:w-auto md:aspect-[9/16] md:rounded-2xl">
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: media ? "#000" : storyBackground(story.background ?? "#eb8a00") }}
            onPointerDown={(e) => {
              downAt.current = e.timeStamp;
              setHeld(true);
            }}
            onPointerUp={(e) => {
              setHeld(false);
              if (e.timeStamp - downAt.current < 250) tap(e);
            }}
            onPointerLeave={() => setHeld(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {story.type === "image" && media?.url && (
              <img
                src={media.url}
                alt=""
                draggable={false}
                onLoad={() => setShownId(story.id)}
                onError={() => setShownId(story.id)}
                className="max-h-full max-w-full object-contain select-none"
              />
            )}
            {story.type === "video" && media?.url && (
              <video
                ref={video}
                key={story.id}
                src={media.url}
                autoPlay
                playsInline
                onLoadedMetadata={(e) => setVideoMs(e.currentTarget.duration * 1000)}
                onTimeUpdate={(e) => show(e.currentTarget.currentTime * 1000)}
                onEnded={() => go(1)}
                className="max-h-full max-w-full"
              />
            )}
            {loading && <Loader2 className="absolute size-8 animate-spin text-white/80" />}
            {media && !media.url && (
              <div className="flex flex-col items-center gap-3 text-sm text-white/80">
                <Loader2 className="size-8 animate-spin" />
                {tr.stories.processing}
              </div>
            )}
            {!media && story.text && story.fromChat && (
              <ChatBubbleCard text={story.text} bubble={story.bubble} quote={story.quote} />
            )}
            {!media && story.text && !story.fromChat && (
              <p className="px-8 text-center text-2xl leading-snug font-semibold break-words whitespace-pre-wrap select-none">{story.text}</p>
            )}
          </div>

          {!loading && (
            <>
              <StoryDrawingLayer drawing={story.drawing}>
                <StoryStickers {...stickers} placed />
              </StoryDrawingLayer>
            </>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {!loading && <StoryStickers {...stickers} placed={false} />}
            {!loading && media && story.text && <p className="text-center text-base break-words whitespace-pre-wrap">{story.text}</p>}
            {mine && (
              <button
                type="button"
                onClick={() => setShowViewers(true)}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm font-medium"
              >
                <Eye className="size-4" />
                {tr.stories.views(story.viewCount ?? 0)}
              </button>
            )}
            {!mine && <ReplyBar key={story.id} story={story} owner={group.user} onTyping={setReplying} />}
          </div>

          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-6">
            <div className="flex gap-1">
              {group.stories.map((s, i) => (
                <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                  <span
                    className="block h-full bg-white"
                    style={{ width: `${i < si ? 100 : i > si ? 0 : Math.min(100, (elapsed / length) * 100)}%` }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar user={group.user} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {mine ? tr.stories.yours : group.user.displayName}
                <span className="ml-2 font-normal text-white/70">{timeAgo(story.createdAt)}</span>
              </span>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? tr.stories.play : tr.stories.pause}
                className="grid size-9 place-items-center rounded-full hover:bg-white/10"
              >
                {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
              </button>
              {mine && (
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  aria-label={tr.stories.delete}
                  title={tr.stories.delete}
                  className="grid size-9 place-items-center rounded-full hover:bg-white/10"
                >
                  <Trash2 className="size-5" />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label={tr.common.close} className="grid size-9 place-items-center rounded-full hover:bg-white/10">
                <X className="size-6" />
              </button>
            </div>
          </div>
          {showViewers && <Viewers storyId={story.id} onClose={() => setShowViewers(false)} />}
          {deleting && (
            <Sheet
              title={tr.stories.deleteConfirm}
              actions={[{ label: tr.stories.delete, destructive: true, onSelect: () => void remove() }]}
              onClose={() => setDeleting(false)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={tr.stories.next}
          className="ml-4 hidden size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 md:grid"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
    </Portal>
  );
}

function FromChatLabel() {
  const tr = useT();
  return (
    <p className="flex items-center gap-1.5 px-3 text-sm font-medium text-white/85 drop-shadow">
      <MessageCircle className="size-4" aria-hidden />
      {tr.stories.fromChat}
    </p>
  );
}

const DEFAULT_BUBBLE = `${chatTheme(null).light.bubble},${chatTheme(null).light.bubbleInk}`;

/** The first story background that doesn't share its colour with a chat bubble put on it. */
export const backgroundAround = (bubble: string | undefined) =>
  STORY_BACKGROUNDS.find((b) => !b.startsWith((bubble ?? DEFAULT_BUBBLE).split(",")[0]!)) ?? STORY_BACKGROUNDS[0];

export function ChatBubbleCard({ text, bubble, quote }: { text: string; bubble: string | null; quote: StoryDTO["quote"] }) {
  const tr = useT();
  const me = useSession((s) => s.user?.id);
  const [background, color] = (bubble ?? DEFAULT_BUBBLE).split(",");
  return (
    <div className="mx-8 flex max-w-[calc(100%-4rem)] flex-col items-start gap-2 select-none">
      {quote && (
        <div className="flex max-w-full items-center gap-2 text-white drop-shadow">
          <Avatar user={quote.from.id === me ? { displayName: "#", avatarUrl: null } : quote.from} size="sm" />
          <span className="truncate text-sm font-semibold">{quote.from.id === me ? tr.common.you : quote.from.displayName}</span>
        </div>
      )}
      <div style={{ background, color }} className="max-w-full rounded-[1.75rem] px-5 py-3 shadow-lg ring-1 ring-white/20">
        <p className="line-clamp-6 text-xl leading-snug break-words whitespace-pre-wrap">{text}</p>
        {quote && (
          <p className="mt-1 text-right text-xs opacity-70">
            {shortDate(quote.sentAt)} · {clockTime(quote.sentAt)}
          </p>
        )}
      </div>
      <FromChatLabel />
    </div>
  );
}
