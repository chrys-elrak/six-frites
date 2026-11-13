import { z } from "zod";
import { GeoPoint } from "./chats.js";
import { Id, IsoDate } from "./common.js";
import { PublicUser } from "./invites.js";
import { AttachmentDTO } from "./uploads.js";
import { ASK_PROMPT_MAX } from "./ask.js";
import { LABEL_FONTS, type LabelFont } from "./media-edit.js";

const HOUR = 60 * 60;

export const STORY_LIMITS = {
  text: 700,
  place: 80,
  drawnText: 200,
  /** Longest video, with half a second of slack for how players round the length. */
  videoMs: 30_000,
  videoSlackMs: 500,
  minSecs: HOUR,
  maxSecs: 24 * HOUR,
} as const;

/** How long a story can stay up, offered as choices; the API takes any whole number of seconds in range. */
export const STORY_DURATIONS = [HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR] as const;
export const STORY_DEFAULT_SECS = 24 * HOUR;
/** Units for a custom story or note duration, as in `AUTO_DELETE_UNITS`. */
export const STORY_DURATION_UNITS = [["hours", HOUR]] as const;

/** How long a photo or text story stays on screen before the next one. */
export const STORY_SHOW_MS = 6000;

export const STORY_BACKGROUNDS = [
  "#eb8a00",
  "#e11d48",
  "#7c3aed",
  "#2563eb",
  "#0d9488",
  "#16a34a",
  "#1c1917",
  "#f59e0b,#e11d48",
  "#ec4899,#7c3aed",
  "#7c3aed,#2563eb",
  "#06b6d4,#16a34a",
  "#1c1917,#57534e",
] as const;

/** CSS for a story's background: one colour, or a diagonal gradient between two. */
export function storyBackground(background: string) {
  const [from, to] = background.split(",");
  return to ? `linear-gradient(160deg, ${from}, ${to})` : from!;
}

export const StoryLocation = GeoPoint.extend({
  name: z.string().trim().min(1).max(STORY_LIMITS.place).optional().describe("What the place is called, as the poster typed it"),
});
export type StoryLocation = z.infer<typeof StoryLocation>;

export const STORY_STICKER_SCALE = { min: 0.5, max: 3 } as const;

const Turn = z.number().min(-180).max(180).optional().describe("How far it is turned, in degrees clockwise");

/** An angle in degrees brought between -180 and 180, and straight when it is within a few degrees of it. */
export function turned(deg: number) {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return Math.abs(d) < 4 ? 0 : d;
}

/** The angle in degrees of the line from a to b, for turning something with two fingers or a handle. */
export const angleOf = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export const StoryLink = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Only web links")
    .describe("Where it goes, http or https"),
  label: z.string().trim().max(40).optional().describe("What the sticker says instead of the address"),
});
export type StoryLink = z.infer<typeof StoryLink>;

const Layer = z.number().int().min(0).max(999).optional().describe("Stacking order among the stickers and texts: higher sits on top");

const StorySpot = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(STORY_STICKER_SCALE.min).max(STORY_STICKER_SCALE.max).optional().describe("How much bigger or smaller than usual"),
  rotate: Turn,
  z: Layer,
});
export type StorySpot = z.infer<typeof StorySpot>;

/** How many anonymous messages, and how many GIFs, one story can show. */
export const STORY_ASKS = 5;
export const STORY_GIFS = 5;
/** Photos placed like stickers; they only exist drawn into a story's picture, never stored on their own. */
export const STORY_PHOTOS = 5;
export const STORY_STICKERS = [
  "ask",
  "ask2",
  "ask3",
  "ask4",
  "ask5",
  "gif",
  "gif2",
  "gif3",
  "gif4",
  "gif5",
  "photo",
  "photo2",
  "photo3",
  "photo4",
  "photo5",
  "location",
  "date",
  "time",
  "link",
  "asklink",
] as const;
export type StorySticker = (typeof STORY_STICKERS)[number];
/** The stickers a story can have several of, and how many. */
const MANY = { ask: STORY_ASKS, gif: STORY_GIFS, photo: STORY_PHOTOS };
type Many = keyof typeof MANY;
/** The sticker showing a story's `i`th anonymous message or GIF, from 0. */
export const stickerOf = (kind: Many, i: number) => (i ? `${kind}${i + 1}` : kind) as StorySticker;
/** Which of the story's anonymous messages or GIFs a sticker shows, or -1 when it isn't one of them. */
export const stickerIndex = (kind: Many, k: StorySticker) => (k === kind ? 0 : new RegExp(`^${kind}\\d$`).test(k) ? Number(k.slice(kind.length)) - 1 : -1);

export const StoryPositions = z
  .object({
    ask: StorySpot.optional(),
    ask2: StorySpot.optional(),
    ask3: StorySpot.optional(),
    ask4: StorySpot.optional(),
    ask5: StorySpot.optional(),
    gif: StorySpot.optional(),
    gif2: StorySpot.optional(),
    gif3: StorySpot.optional(),
    gif4: StorySpot.optional(),
    gif5: StorySpot.optional(),
    photo: StorySpot.optional(),
    photo2: StorySpot.optional(),
    photo3: StorySpot.optional(),
    photo4: StorySpot.optional(),
    photo5: StorySpot.optional(),
    location: StorySpot.optional(),
    link: StorySpot.optional(),
    asklink: StorySpot.optional(),
    date: StorySpot.optional(),
    time: StorySpot.optional(),
  })
  .describe(
    "Where the poster dragged each sticker and how big they made it: its centre, as fractions of the story's width and height from the top left. Ones left out sit in the row at the bottom",
  );
export type StoryPositions = z.infer<typeof StoryPositions>;

/**
 * The stacking order that puts a sticker or text now at `current` above every other one on the story, keeping it
 * when it already is alone on top. Without one, stickers sit under the drawing and texts over it.
 */
export function zToTop(positions: StoryPositions, texts: { z?: number }[], current?: number) {
  const all = [...STORY_STICKERS.map((k) => positions[k]?.z ?? 0), ...texts.map((t) => t.z ?? 0)];
  const top = Math.max(0, ...all);
  return current === top && current > 0 && all.filter((v) => v === top).length === 1 ? current : Math.min(999, top + 1);
}

/** The positions once a story's `i`th anonymous message or GIF is taken off: the ones after it each take the spot of the one before. */
export function dropSpot(positions: StoryPositions, kind: Many, i: number): StoryPositions {
  const next = { ...positions };
  for (let j = i; j < MANY[kind]; j++) {
    const after = j + 1 < MANY[kind] ? positions[stickerOf(kind, j + 1)] : undefined;
    if (after) next[stickerOf(kind, j)] = after;
    else delete next[stickerOf(kind, j)];
  }
  return next;
}

export const STORY_SHAPES = ["pen", "arrow", "circle", "rect"] as const;
export type StoryShape = (typeof STORY_SHAPES)[number];

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Fraction = z.number().min(-0.25).max(1.25);

export const StoryStroke = z.object({
  shape: z.enum(STORY_SHAPES),
  color: Hex,
  size: z.number().min(0.002).max(0.05).describe("Line width, as a fraction of the story's width"),
  points: z
    .array(Fraction)
    .min(4)
    .max(1200)
    .describe("x, y pairs as fractions of the story; a shape or an arrow is its first and last corner, an arrow pointing at the last"),
});
export type StoryStroke = z.infer<typeof StoryStroke>;

export const STORY_TEXT_LOOKS = ["plain", "box", "outline"] as const;
export type StoryTextLook = (typeof STORY_TEXT_LOOKS)[number];

export const StoryText = z.object({
  text: z.string().trim().min(1).max(STORY_LIMITS.drawnText),
  color: Hex,
  font: z.enum(Object.keys(LABEL_FONTS) as [LabelFont, ...LabelFont[]]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(STORY_STICKER_SCALE.min).max(STORY_STICKER_SCALE.max).default(1),
  look: z.enum(STORY_TEXT_LOOKS).optional().describe("plain when left out; box puts it on a pill of its colour, outline rings it"),
  rotate: Turn,
  z: Layer,
});
export type StoryText = z.infer<typeof StoryText>;

export const StoryDrawing = z
  .object({ strokes: z.array(StoryStroke).max(80).default([]), texts: z.array(StoryText).max(10).default([]) })
  .describe("Lines, shapes, arrows and text the poster drew on top, placed as fractions of the story");
export type StoryDrawing = z.infer<typeof StoryDrawing>;

/** Text is sized from the story's width, so it looks the same on every screen: this much of it at scale 1. */
export const STORY_TEXT_SIZE = 0.075;
/** Black or white, whichever reads better on `hex`: the text on a box, or the ring around outlined text. */
export function inkOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 0.6 ? "#111111" : "#ffffff";
}

export const STORY_PEN_SIZES = [0.008, 0.016, 0.03] as const;
export const EMPTY_DRAWING: StoryDrawing = { strokes: [], texts: [] };

/** A stroke starting at x, y: a dot until it is dragged out. */
export const startStroke = (shape: StoryShape, color: string, size: number, x: number, y: number): StoryStroke => ({
  shape,
  color,
  size,
  points: [x, y, x, y],
});

/** Follows the finger: a pen line grows, a shape or an arrow stretches its far corner to x, y. */
export function extendStroke(s: StoryStroke, x: number, y: number): StoryStroke {
  const fit = (v: number) => Math.min(1.25, Math.max(-0.25, v));
  const [fx, fy] = [fit(x), fit(y)];
  const p = s.points;
  if (s.shape !== "pen") return { ...s, points: [p[0]!, p[1]!, fx, fy] };
  if (p.length >= 1200 || Math.hypot(fx - p.at(-2)!, fy - p.at(-1)!) < 0.003) return s;
  return { ...s, points: [...p, fx, fy] };
}

/** A shape or an arrow too small to see, from a tap rather than a drag. */
export const strokeTooSmall = (s: StoryStroke) =>
  s.shape !== "pen" && Math.hypot(s.points[2]! - s.points[0]!, s.points[3]! - s.points[1]!) < 0.02;

/** The SVG path of a stroke on a story `w` by `h` pixels: circles fill the box between its corners. */
export function storyStrokePath(s: StoryStroke, w: number, h: number) {
  const p = s.points;
  const [x0, y0, x1, y1] = [p[0]! * w, p[1]! * h, p.at(-2)! * w, p.at(-1)! * h];
  if (s.shape === "rect") return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  if (s.shape === "circle") {
    const [rx, ry, cy] = [Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, (y0 + y1) / 2];
    return `M${x0} ${cy}A${rx} ${ry} 0 1 0 ${x1} ${cy}A${rx} ${ry} 0 1 0 ${x0} ${cy}Z`;
  }
  if (s.shape === "arrow") {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = Math.min(Math.hypot(x1 - x0, y1 - y0) / 2, s.size * w * 4 + w * 0.02);
    const wing = (side: number) => `${x1 - head * Math.cos(angle + side)} ${y1 - head * Math.sin(angle + side)}`;
    return `M${x0} ${y0}L${x1} ${y1}M${wing(0.5)}L${x1} ${y1}L${wing(-0.5)}`;
  }
  let d = `M${x0} ${y0}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]! * w} ${p[i + 1]! * h}`;
  return d;
}

export const CreateStoryInput = z
  .object({
    text: z.string().trim().max(STORY_LIMITS.text).optional().describe("The text of a text story, or a caption on a photo or video"),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}(,#[0-9a-f]{6})?$/i)
      .transform((s) => s.toLowerCase())
      .optional()
      .describe("What's behind a text story: a colour like #eb8a00, or two for a gradient, like #f59e0b,#e11d48"),
    uploadId: Id.optional().describe("A completed `image` or `video` upload; videos can be at most 30 seconds"),
    gifId: z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .describe("Older apps: one GIF to show; use gifIds"),
    gifIds: z
      .array(z.string().regex(/^[\w-]{1,128}$/))
      .max(STORY_GIFS)
      .optional()
      .describe("GIFs from GET /v1/gifs shown on top of the story"),
    location: StoryLocation.optional(),
    link: StoryLink.optional(),
    askLink: z.boolean().optional().describe("Invite anonymous messages: a sticker that opens your anonymous link"),
    askText: z.string().trim().max(ASK_PROMPT_MAX).optional().describe("With askLink: what the sticker says, instead of the app's line"),
    askId: Id.optional().describe("Older apps: one anonymous message to show; use askIds"),
    askIds: z
      .array(Id)
      .max(STORY_ASKS)
      .refine((ids) => new Set(ids).size === ids.length, "Each anonymous message can be on a story once")
      .optional()
      .describe("Anonymous messages you received, each shown on the story as a card: its text, photo or GIF"),
    fromChat: z.boolean().optional().describe("The text is a chat message shared as it was, shown as a chat bubble"),
    bubble: z
      .string()
      .regex(/^#[0-9a-f]{6},#[0-9a-f]{6}$/i)
      .transform((s) => s.toLowerCase())
      .optional()
      .describe("With fromChat: the bubble's colour and its text's, as in the chat, like #e11d48,#ffffff"),
    messageId: Id.optional().describe("With fromChat: the message it is, so the story shows who sent it, as you see them, and when"),
    showDate: z.boolean().optional().describe("Show the day it was posted on the story"),
    showTime: z.boolean().optional().describe("Show the time it was posted on the story"),
    positions: StoryPositions.optional(),
    drawing: StoryDrawing.optional(),
    durationSecs: z
      .number()
      .int()
      .min(STORY_LIMITS.minSecs)
      .max(STORY_LIMITS.maxSecs)
      .default(STORY_DEFAULT_SECS)
      .describe("How long it stays up, from one hour to a day"),
  })
  .refine((v) => !!v.uploadId || !!v.text || !!v.gifId || !!v.gifIds?.length || !!v.link || !!v.askLink || !!v.askId || !!v.askIds?.length || !!v.drawing?.strokes.length || !!v.drawing?.texts.length, {
    message: "A story needs text, a photo, a video, a GIF, a link, an anonymous message or a drawing",
  });
export type CreateStoryInput = z.infer<typeof CreateStoryInput>;

const StoryGif = z.object({ url: z.string().url(), width: z.number().int().nullable(), height: z.number().int().nullable() });
export type StoryGif = z.infer<typeof StoryGif>;

const StoryAsk = z.object({
  text: z.string().describe("Empty when only a photo or a GIF was sent"),
  prompt: z.string().nullable().describe("The prompt it answered; null for the app's own"),
  photoUrl: z.string().url().nullable(),
  gif: z
    .object({ url: z.string().url(), width: z.number().int().nullable(), height: z.number().int().nullable() })
    .nullable()
    .describe("As an MP4 to play muted on a loop"),
});
export type StoryAsk = z.infer<typeof StoryAsk>;

export const StoryDTO = z.object({
  id: Id,
  type: z.enum(["text", "image", "video"]),
  text: z.string().nullable(),
  fromChat: z.boolean().describe("The text is a chat message shared as it was"),
  bubble: z.string().nullable().describe("With fromChat: the bubble's colour and its text's, #rrggbb,#rrggbb"),
  quote: z
    .object({ from: PublicUser.describe("Who sent the message, as the poster sees them"), sentAt: IsoDate })
    .nullable()
    .describe("With fromChat and a messageId: who sent the message and when"),
  background: z.string().nullable(),
  media: AttachmentDTO.nullable(),
  gif: StoryGif.nullable().describe("Older apps: the first of `gifs`"),
  gifs: z.array(StoryGif).describe("GIFs on top of the story, as MP4s to play muted on a loop"),
  location: StoryLocation.nullable(),
  link: StoryLink.nullable().describe("A link sticker to open"),
  askCode: z.string().nullable().describe("The poster's anonymous link code, as it is now, when the story invites anonymous messages; for the URL, see askUrl"),
  askText: z.string().nullable().describe("What the anonymous link sticker says; null for the app's line"),
  ask: StoryAsk.nullable().describe("Older apps: the first of `asks`"),
  asks: z.array(StoryAsk).describe("Anonymous messages the poster received and shared, each as a card"),
  showDate: z.boolean(),
  showTime: z.boolean(),
  positions: StoryPositions,
  drawing: StoryDrawing,
  createdAt: IsoDate,
  expiresAt: IsoDate,
  seen: z.boolean().describe("You opened it; always true for your own"),
  viewCount: z.number().int().nullable().describe("How many people opened it; only on your own"),
});
export type StoryDTO = z.infer<typeof StoryDTO>;

export const StoryGroupDTO = z.object({
  user: PublicUser,
  stories: z.array(StoryDTO).describe("Oldest first"),
});
export type StoryGroupDTO = z.infer<typeof StoryGroupDTO>;

export const NOTE_LIMIT = 60;
/** A text message's words as a story or a note would take them, and whether they fit in each. */
export function shareTargets(text: string | null | undefined) {
  const t = text?.trim() ?? "";
  return { text: t, story: !!t && t.length <= STORY_LIMITS.text, note: !!t && t.length <= NOTE_LIMIT };
}

/** How long a note stays up. */
export const NOTE_SECS = 24 * HOUR;

/** The colours a note's bubble can take; without one it follows the theme. */
export const NOTE_BACKGROUNDS = STORY_BACKGROUNDS.filter((b) => !b.includes(","));

export const SetNoteInput = z
  .object({
    text: z.string().trim().max(NOTE_LIMIT).default(""),
    fromChat: z.boolean().optional().describe("The text is a chat message shared as it was, shown in quotes"),
    font: z.enum(Object.keys(LABEL_FONTS) as [LabelFont, ...LabelFont[]]).optional().describe("The font the text is written in; the app's own when left out"),
    messageId: Id.optional().describe("With fromChat: the message it is, so the note shows who sent it, as you see them, and when"),
    gifId: z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .describe("A GIF from GET /v1/gifs shown in the note"),
    location: StoryLocation.optional().describe("A place shown under the note, which opens in maps"),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .transform((s) => s.toLowerCase())
      .optional()
      .describe("The bubble's colour, like #e11d48; without it the bubble follows the reader's theme"),
    durationSecs: z
      .number()
      .int()
      .min(STORY_LIMITS.minSecs)
      .max(STORY_LIMITS.maxSecs)
      .default(NOTE_SECS)
      .describe("How long it stays up, from one hour to a day"),
  })
  .refine((v) => !!v.text || !!v.gifId || !!v.location, { message: "A note needs text, a GIF or a place", path: ["text"] });

export const NoteDTO = z.object({
  id: Id,
  text: z.string().describe("Empty when the note is only a GIF or a place"),
  fromChat: z.boolean(),
  font: z.enum(Object.keys(LABEL_FONTS) as [LabelFont, ...LabelFont[]]).nullable(),
  quote: z
    .object({ from: PublicUser.describe("Who sent the message, as the note's owner sees them"), sentAt: IsoDate })
    .nullable()
    .describe("With fromChat and a messageId: who sent the message and when"),
  background: z.string().nullable(),
  gif: z
    .object({
      id: z.string().describe("Send it again with `gifId`"),
      url: z.string().url(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
    })
    .nullable()
    .describe("As an MP4 to play muted on a loop"),
  location: StoryLocation.nullable(),
  viewCount: z.number().int().nullable().describe("How many contacts opened it; only on yours"),
  createdAt: IsoDate,
  expiresAt: IsoDate,
});
export type NoteDTO = z.infer<typeof NoteDTO>;

/** How long a note was put up for, to the nearest minute because its two timestamps come from different clocks. */
export const noteSecs = (note: Pick<NoteDTO, "createdAt" | "expiresAt">) =>
  Math.round((Date.parse(note.expiresAt) - Date.parse(note.createdAt)) / 60_000) * 60;

export const noteChanged = (
  note: NoteDTO | null,
  draft: { text: string; background: string | null; gifId?: string; location: StoryLocation | null; durationSecs: number; font: LabelFont },
) =>
  !note ||
  (draft.font === "classic" ? null : draft.font) !== note.font ||
  JSON.stringify(draft.location) !== JSON.stringify(note.location) ||
  draft.text !== note.text ||
  draft.background !== note.background ||
  draft.gifId !== note.gif?.id ||
  draft.durationSecs !== noteSecs(note);

export const NotesDTO = z.object({
  mine: NoteDTO.nullable(),
  items: z.array(z.object({ user: PublicUser, note: NoteDTO })).describe("Contacts' notes, newest first"),
});
export type NotesDTO = z.infer<typeof NotesDTO>;

export const STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥"] as const;
export type StoryReaction = (typeof STORY_REACTIONS)[number];
export const ReactStoryInput = z.object({ emoji: z.enum(STORY_REACTIONS) });

/** Someone's reactions as [emoji, how many times], in the order they first used each one. */
export function countReactions(reactions: readonly string[]) {
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts];
}

/** Someone reacted to one of your stories, as you see them. */
export interface StoryReactedDTO {
  storyId: string;
  user: PublicUser;
  emoji: StoryReaction;
  /** Set when it was their note, whose id `storyId` holds. */
  note?: boolean;
}

export const StoryViewerDTO = z.object({
  user: PublicUser,
  viewedAt: IsoDate,
  reactions: z.array(z.enum(STORY_REACTIONS)).describe("Every emoji they reacted with, oldest first, at most the last 30"),
});
export type StoryViewerDTO = z.infer<typeof StoryViewerDTO>;

export const NoteViewerDTO = StoryViewerDTO.extend({ clickedAt: IsoDate.nullable().describe("When they last opened the link in it") });
export type NoteViewerDTO = z.infer<typeof NoteViewerDTO>;
