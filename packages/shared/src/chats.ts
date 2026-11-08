import { z } from "zod";
import { Id, IsoDate, PageQuery } from "./common.js";
import { AttachmentDTO } from "./uploads.js";
import { PublicUser } from "./invites.js";
import { StickerDTO } from "./stickers.js";
import { isChatThemeId } from "./chat-themes.js";
import { EncryptedInput, EncryptionDTO } from "./e2ee.js";
import { ChatGame, GameMoveDTO } from "./games.js";
import { LIVE_GAMES } from "./live.js";

export const MessageType = z.enum([
  "text",
  "image",
  "video",
  "video_note",
  "voice",
  "file",
  "gif",
  "sticker",
  "service",
  "location",
  "checklist",
  "game",
]);
export type MessageType = z.infer<typeof MessageType>;

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional().describe("How far off it may be, in meters"),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** Opens the place in Google Maps: the app on Android, the website elsewhere. */
export const mapsUrl = (p: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

export const coordsLabel = (p: GeoPoint) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export const CHECKLIST = { title: 128, item: 200, items: 30 } as const;

/** Most photos and videos one album holds, as on Telegram. */
export const MAX_ALBUM = 10;

/**
 * Album ids for files sent together, one per file: photos and videos share an id, ten at a time;
 * anything else, or a lone photo, gets none.
 */
export function albumIds(kinds: string[], newId: () => string): (string | undefined)[] {
  const visual = (k: string) => k === "image" || k === "video";
  if (kinds.filter(visual).length < 2) return kinds.map(() => undefined);
  let id = newId();
  let count = 0;
  return kinds.map((k) => {
    if (!visual(k)) return undefined;
    if (count === MAX_ALBUM) {
      id = newId();
      count = 0;
    }
    count++;
    return id;
  });
}

export const Checklist = z.object({
  title: z.string().trim().min(1).max(CHECKLIST.title),
  items: z.array(z.string().trim().min(1).max(CHECKLIST.item)).min(1).max(CHECKLIST.items),
});
export type Checklist = z.infer<typeof Checklist>;

export const ChecklistMark = z.object({
  item: z.number().int().describe("Index in the checklist's items"),
  userId: Id.describe("Who marked it done"),
  at: IsoDate,
});
export type ChecklistMark = z.infer<typeof ChecklistMark>;

export const EntityType = z.enum(["bold", "italic", "underline", "strike", "code", "spoiler", "color", "font", "size", "highlight", "outline"]);
export type EntityType = z.infer<typeof EntityType>;

/** Colours text, its background and its outline can take; white and black read on only one kind of bubble. */
export const TEXT_COLORS = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  white: "#ffffff",
  black: "#000000",
} as const;
export type TextColor = keyof typeof TEXT_COLORS;

/** Ready-made two-colour gradients for text. */
export const TEXT_GRADIENTS = {
  sunset: ["#f59e0b", "#e11d48"],
  ocean: ["#06b6d4", "#6366f1"],
  candy: ["#ec4899", "#a855f7"],
  forest: ["#84cc16", "#0d9488"],
} as const;
export type TextGradient = keyof typeof TEXT_GRADIENTS;

const HEX = /^#[0-9a-f]{6}$/;

/**
 * What a colour range's value paints: a named colour or gradient, any colour as #rrggbb, or a gradient between
 * two as #rrggbb-#rrggbb. Null when it's none of these.
 */
export function textColor(value: string | undefined): { solid: string } | { gradient: readonly [string, string] } | null {
  if (!value) return null;
  if (value in TEXT_COLORS) return { solid: TEXT_COLORS[value as TextColor] };
  if (value in TEXT_GRADIENTS) return { gradient: TEXT_GRADIENTS[value as TextGradient] };
  if (HEX.test(value)) return { solid: value };
  const [a, b, ...rest] = value.split("-");
  return !rest.length && a && b && HEX.test(a) && HEX.test(b) ? { gradient: [a, b] } : null;
}

/** The colour a fraction `t` of the way along a gradient. */
export function mixColor([a, b]: readonly [string, string], t: number) {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour at `hue` (0 to 360) and `light` (0 black, 0.5 the pure colour, 1 white), as #rrggbb. */
export function hslHex(hue: number, light: number) {
  const a = Math.min(light, 1 - light);
  const part = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round((light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

/** Text sizes in points the format bar offers; any whole size in MESSAGE_TEXT_SIZE_RANGE works. */
export const MESSAGE_TEXT_SIZES = [10, 12, 14, 18, 22, 28, 36] as const;
export const MESSAGE_TEXT_SIZE_RANGE = { min: 8, max: 48 } as const;

/** The size in points a size range's value asks for, or null when it isn't a whole size in range. */
export function textSize(value: string | undefined) {
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const n = Number(value);
  return n >= MESSAGE_TEXT_SIZE_RANGE.min && n <= MESSAGE_TEXT_SIZE_RANGE.max ? n : null;
}

/** Fonts text can take; the apps load them under the family names in LABEL_FONTS. */
export const TEXT_FONTS = ["serif", "marker", "script", "typewriter", "handwriting", "lobster", "tall", "rounded", "pixel", "elegant"] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

export const MessageEntity = z.object({
  type: EntityType,
  offset: z.number().int().min(0),
  length: z.number().int().min(1),
  value: z
    .string()
    .max(16)
    .optional()
    .describe("For color, highlight (a background behind the text) and outline (a line around its letters): a TEXT_COLORS or TEXT_GRADIENTS name, #rrggbb, or #rrggbb-#rrggbb; for font: a TEXT_FONTS name; for size: a whole size in points, 8 to 48"),
});
export type MessageEntity = z.infer<typeof MessageEntity>;

export const Entities = z
  .array(MessageEntity)
  .max(100)
  .describe(
    "Ranges in UTF-16 code units of the trimmed text. Different types may overlap (bold inside a spoiler); ranges of the same type may not.",
  );

const valueFits = (e: MessageEntity) =>
  e.type === "color" || e.type === "highlight" || e.type === "outline"
    ? textColor(e.value) !== null
    : e.type === "font"
      ? (TEXT_FONTS as readonly string[]).includes(e.value ?? "")
      : e.type === "size"
        ? textSize(e.value) !== null
        : e.value === undefined;

/**
 * Checks that every range sits inside the text, that ranges of the same type never overlap, and that colour and
 * font ranges name one the apps know.
 */
export function entitiesFit(text: string, entities: MessageEntity[] = []) {
  const byType = new Map<EntityType, MessageEntity[]>();
  for (const e of entities) {
    if (e.offset + e.length > text.length || !valueFits(e)) return false;
    byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  }
  for (const ranges of byType.values()) {
    const sorted = [...ranges].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.offset < sorted[i - 1]!.offset + sorted[i - 1]!.length) return false;
    }
  }
  return true;
}

/** Replaces each spoiler range with a fixed mask so previews never reveal hidden text or its length. */
export function maskSpoilers(text: string, entities: MessageEntity[] = [], mask = "••••") {
  const spoilers = entities.filter((e) => e.type === "spoiler").sort((a, b) => a.offset - b.offset);
  let out = "";
  let cursor = 0;
  for (const e of spoilers) {
    out += text.slice(cursor, e.offset) + mask;
    cursor = e.offset + e.length;
  }
  return out + text.slice(cursor);
}

export const ReplyPreview = z.object({
  id: Id,
  senderId: Id,
  type: MessageType,
  text: z.string().nullable(),
  spoiler: z.boolean(),
  ephemeral: z.boolean(),
  deleted: z.boolean(),
  encrypted: z.boolean().describe("The quoted text is encrypted; show it from your own copy of that message"),
});
export type ReplyPreview = z.infer<typeof ReplyPreview>;

export const StoryReply = z
  .object({
    id: Id,
    ownerId: Id.describe("Whose story or note it is"),
    kind: z.enum(["text", "image", "video", "note"]).describe("note: a note they answered, its text in `text`"),
    text: z.string().nullable().describe("The start of the story's text or caption"),
    background: z.string().nullable().describe("A text story's colour, or two for a gradient"),
    imageUrl: z.string().url().nullable().describe("A photo story's picture, or a video's first frame; it stops working once the story is gone"),
  })
  .describe("The story or note a message answers, as it was when they answered: it may be gone since");
export type StoryReply = z.infer<typeof StoryReply>;

export const EphemeralInput = z
  .object({
    maxViews: z.number().int().min(1).max(10).optional().describe("Destroy after this many views by the recipient"),
    ttlSeconds: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60 * 60)
      .optional()
      .describe("Destroy this many seconds after the recipient first opens it"),
  })
  .refine((v) => v.maxViews !== undefined || v.ttlSeconds !== undefined, "Set maxViews, ttlSeconds or both");
export type EphemeralInput = z.infer<typeof EphemeralInput>;

/** How often, and for how long after it was opened, a sender can re-arm a self-destructing message. */
export const EPHEMERAL_RESEND = { max: 3, windowSeconds: 60 * 60 } as const;

export const EphemeralDTO = z.object({
  maxViews: z.number().int().nullable(),
  ttlSeconds: z.number().int().nullable(),
  views: z.number().int().describe("How many times the recipient opened it"),
  firstViewedAt: IsoDate.nullable(),
  locked: z.boolean().describe("Content is withheld for you; open it with POST /v1/messages/{id}/view"),
  expired: z.boolean().describe("Its views or timer ran out; the recipient can no longer open it"),
  purged: z.boolean().describe("Content permanently deleted; it can no longer be resent"),
  resent: z.boolean().describe("The sender re-armed it after it was opened"),
  resendsLeft: z.number().int().describe("How many more times the sender can re-arm it"),
  resendUntil: IsoDate.nullable().describe("Until when the sender can resend it, once it has been opened"),
});
export type EphemeralDTO = z.infer<typeof EphemeralDTO>;

export const ServiceAction = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("auto_delete"), secs: z.number().int().nullable() }),
    z.object({ type: z.literal("theme"), theme: z.string().nullable() }),
    z.object({ type: z.literal("e2ee") }),
    z.object({ type: z.literal("vanish"), on: z.boolean() }),
    z.object({ type: z.literal("pin") }),
    z.object({ type: z.literal("group_created"), title: z.string() }),
    z.object({ type: z.literal("joined"), name: z.string() }),
    z.object({ type: z.literal("left"), name: z.string() }),
    z.object({ type: z.literal("removed"), name: z.string() }),
    z.object({ type: z.literal("renamed"), title: z.string() }),
    z.object({ type: z.literal("group_photo") }),
    z.object({
      type: z.literal("call"),
      video: z.boolean(),
      secs: z.number().int().nullable().describe("How long it lasted; null if it was missed or declined"),
    }),
    z.object({ type: z.literal("live_invite"), game: z.enum(LIVE_GAMES), roomId: z.string(), from: z.string() }),
    z.object({
      type: z.literal("live_result"),
      game: z.enum(LIVE_GAMES),
      result: z.enum(["won", "lost", "draw"]),
      score: z
        .array(z.number().int())
        .length(2)
        .optional()
        .describe("Your score, then the bot's best, in the games that keep one: boxes, pairs or word points"),
    }),
  ])
  .describe(
    "What a `service` message announces: `auto_delete` means the sender set the timer to `secs` (null: off); `theme` means they set the chat background (null: back to each person's default); `e2ee` marks where end-to-end encryption starts; `vanish` means the sender turned vanish mode on or off; `pin` means they pinned a message; `call` logs a call the sender made; `live_invite` is posted in your chat when `from` asks you to a live game; `live_result` is how a live game you played alone against Six Frites Game ended, for you; in a group, `group_created`, `joined`, `left`, `removed`, `renamed` and `group_photo` tell what happened to the group and to whom (`name` is how they showed there)",
  );
export type ServiceAction = z.infer<typeof ServiceAction>;

/** How many messages a chat can have pinned at once. */
export const PIN_LIMIT = 20;

/** Allowed range for a chat's auto-delete timer, in seconds. */
export const AUTO_DELETE = { min: 60 * 60, max: 365 * 24 * 60 * 60 } as const;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Timers offered in the auto-delete menu; any other value in range can be set as a custom one. */
export const AUTO_DELETE_PRESETS = [
  HOUR,
  8 * HOUR,
  DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
  180 * DAY,
  365 * DAY,
] as const;

/** Units for a custom auto-delete timer, in seconds. A month is 30 days, as in `durationLabel`. */
export const AUTO_DELETE_UNITS = [
  ["hours", HOUR],
  ["days", DAY],
  ["weeks", 7 * DAY],
  ["months", 30 * DAY],
] as const;

export const MUTE_PRESETS = [
  { label: "1 hour", secs: 60 * 60 },
  { label: "8 hours", secs: 8 * 60 * 60 },
  { label: "1 day", secs: 24 * 60 * 60 },
  { label: "1 week", secs: 7 * 24 * 60 * 60 },
] as const;

export const MAX_MUTE_SECS = 365 * 24 * 60 * 60;

/** Whether a chat is muted right now; a timed mute counts as over once its end has passed. */
export function isMuted(chat: { muted: boolean; mutedUntil: string | null }, now = Date.now()) {
  return chat.muted && (chat.mutedUntil === null || Date.parse(chat.mutedUntil) > now);
}

export const MessageListQuery = PageQuery.extend({
  only: z
    .enum(["media", "files", "links", "text"])
    .optional()
    .describe(
      "media: photos and videos; files; links: text messages that may hold a link (every encrypted one, since only your device can read it); text: messages that can hold text, captions included, for searching on your device. Leaves out deleted and self-destructing messages.",
    ),
  from: IsoDate.optional().describe("Only messages sent at or after this time"),
  to: IsoDate.optional().describe("Only messages sent before this time"),
  until: Id.optional().describe(
    "Ignore `limit` and keep going until this message is in the page (up to 2000 messages), to jump to it",
  ),
  thread: Id.optional().describe("In a group, the comments on this message instead of the chat's own messages"),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;

export const MessageEffect = z
  .enum(["fire", "gift", "hearts", "confetti"])
  .describe("How a text message shows: in flames, gift-wrapped until opened, or with hearts or confetti when it arrives");
export type MessageEffect = z.infer<typeof MessageEffect>;

export const ReactionGif = z.object({
  url: z.string().url(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ReactionGif = z.infer<typeof ReactionGif>;

export const MessageDTO = z.object({
  id: Id,
  chatId: Id,
  senderId: Id,
  clientId: z.string(),
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  spoiler: z.boolean(),
  effect: MessageEffect.nullable(),
  silent: z.boolean().describe("Sent with `/silent`: it arrives without a notification or sound"),
  bump: z.boolean().describe("A bump: it brings the message in `replyTo` back to the bottom of the chat, as Messenger does"),
  vanish: z.boolean().describe("Sent in vanish mode: it disappears once the other person has read it and left the chat"),
  attachment: AttachmentDTO.nullable(),
  sticker: StickerDTO.nullable(),
  ephemeral: EphemeralDTO.nullable(),
  groupId: z.string().nullable().describe("Photos and videos sent together share it and show as one album"),
  threadId: Id.nullable().describe("In a group, the message this one comments on; it then shows only in that message's comments"),
  thread: z
    .object({
      count: z.number().int().describe("How many comments it has"),
      closed: z.boolean().describe("An admin closed its comments: nobody can add one until they reopen them"),
    })
    .nullable()
    .describe("A group message's comments; null on comments themselves and on service messages"),
  replyTo: ReplyPreview.nullable(),
  story: StoryReply.nullable(),
  action: ServiceAction.nullable(),
  location: GeoPoint.nullable(),
  checklist: Checklist.nullable(),
  checks: z.array(ChecklistMark).describe("The checklist items marked done; either person can tick them"),
  game: ChatGame.nullable(),
  moves: z.array(GameMoveDTO).describe("Answers to the game, oldest first; anyone but the sender can play"),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable(),
  deletedAt: IsoDate.nullable(),
  deletedBy: Id.nullable().describe("Who deleted it for everyone: the sender, or the other person in a direct chat"),
  expiresAt: IsoDate.nullable().describe("When the chat's auto-delete timer removes it for everyone"),
  reactions: z
    .array(
      z.object({
        emoji: z.string().describe("The emoji, or `sticker:<id>` / `gif:<id>` for a sticker or GIF; also what removes it"),
        userIds: z.array(Id),
        sticker: StickerDTO.nullish().describe("For a sticker reaction; null once the sticker is gone"),
        gif: ReactionGif.nullish().describe("For a GIF reaction, as an MP4 to play muted on a loop"),
      }),
    )
    .describe("One entry per emoji, sticker or GIF, oldest first; a person can add several different ones"),
  encryption: EncryptionDTO.nullable().describe(
    "Set for end-to-end encrypted messages: `text`, `entities`, `spoiler` and `effect` are then empty and the content is in your device's envelope",
  ),
});
export type MessageDTO = z.infer<typeof MessageDTO>;

const MessageText = z.string().trim().min(1).max(4000);

export const EditMessageInput = z
  .object({
    text: z.string().trim().max(4000).optional().describe("Empty drops the caption of a photo or file message"),
    entities: Entities.optional(),
    encrypted: EncryptedInput.optional(),
    attachmentId: Id.optional().describe("A completed photo upload that replaces a photo message's picture"),
  })
  .refine((v) => (v.text === undefined) !== (v.encrypted === undefined), {
    message: "Send either text or encrypted content",
    path: ["text"],
  })
  .refine((v) => !v.encrypted || v.entities === undefined, { message: "Entities go inside the encrypted content", path: ["entities"] })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), { message: "Entities fall outside the text", path: ["entities"] });
export type EditMessageInput = z.infer<typeof EditMessageInput>;

export const DeleteScope = z.enum(["me", "all"]);
export type DeleteScope = z.infer<typeof DeleteScope>;

export const DeleteMessagesQuery = z.object({
  ids: z
    .string()
    .max(4000)
    .describe("Comma-separated message ids, at most 100")
    .transform((s) => [
      ...new Set(
        s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ])
    .refine((ids) => ids.length >= 1 && ids.length <= 100, "Provide between 1 and 100 ids"),
  scope: DeleteScope.default("me"),
});
export type DeleteMessagesQuery = z.infer<typeof DeleteMessagesQuery>;

export const MessagesDeletedDTO = z.object({
  chatId: Id,
  messageIds: z.array(Id),
  scope: DeleteScope.describe(
    "`all`: the messages became deleted placeholders. `me`: remove them from this user's view entirely.",
  ),
  by: Id.optional().describe("With `all`: who deleted them"),
});
export type MessagesDeletedDTO = z.infer<typeof MessagesDeletedDTO>;

export const SendMessageInput = z
  .object({
    clientId: z.string().min(1).max(64),
    text: MessageText.optional().describe("Required unless attachmentId is set, in which case it is the caption"),
    entities: Entities.optional(),
    attachmentId: Id.optional().describe("A completed upload from POST /v1/uploads/{id}/complete"),
    gifId: z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .describe("A GIF from GET /v1/gifs; the server saves a copy and attaches it"),
    stickerId: Id.optional().describe("Send this sticker, on its own"),
    location: GeoPoint.optional().describe("Share a place, on its own"),
    checklist: Checklist.optional().describe("Send a checklist, on its own"),
    game: ChatGame.optional().describe("Send a game with your move, on its own"),
    type: z
      .enum(["location", "checklist", "game"])
      .optional()
      .describe("With `encrypted`: the content is a location, a checklist or a game rather than text or a file"),
    replyToId: Id.optional(),
    storyId: Id.optional().describe("Answer this story or note of the other person's: it shows above the message"),
    groupId: z
      .string()
      .regex(/^[\w-]{1,64}$/)
      .optional()
      .describe("The same id on photos and videos sent together, so they show as one album"),
    threadId: Id.optional().describe("In a group, comments on this message rather than posting in the chat"),
    commentsClosed: z.boolean().optional().describe("In a group, for its owner and admins: post with comments closed"),
    spoiler: z.boolean().optional(),
    effect: MessageEffect.optional().describe("Only with text"),
    silent: z.boolean().optional().describe("Deliver it without a notification or sound"),
    bump: z.boolean().optional().describe("Bump the message in `replyToId`: bring it back to the bottom of the chat, on its own"),
    ephemeral: EphemeralInput.optional().describe("Self-destruct after viewing, like Telegram's view-once and timers"),
    encrypted: EncryptedInput.optional(),
    sentAt: IsoDate.optional().describe(
      "When the sender pressed send, on the server's clock (measure the offset with the socket `ping`). Shown in GET /v1/messages/{id}/timing",
    ),
  })
  .refine(
    (v) =>
      v.text !== undefined ||
      v.attachmentId !== undefined ||
      v.gifId !== undefined ||
      v.stickerId ||
      v.location ||
      v.checklist ||
      v.game ||
      v.encrypted ||
      v.bump,
    { message: "Send text, an attachment, a GIF, a sticker, a location, a checklist, a game or encrypted content", path: ["text"] },
  )
  .refine(
    (v) =>
      !v.bump ||
      (v.replyToId !== undefined &&
        v.text === undefined &&
        !v.attachmentId &&
        !v.gifId &&
        !v.stickerId &&
        !v.location &&
        !v.checklist &&
        !v.game &&
        !v.ephemeral &&
        !v.effect),
    { message: "A bump needs `replyToId` and carries nothing else", path: ["bump"] },
  )
  .refine(
    (v) =>
      !v.encrypted ||
      (v.text === undefined &&
        v.entities === undefined &&
        v.spoiler === undefined &&
        v.effect === undefined &&
        !v.gifId &&
        !v.stickerId &&
        !v.location &&
        !v.checklist &&
        !v.game),
    {
      message:
        "Text, entities, spoilers, locations, checklists and games go inside the encrypted content; GIFs and stickers are sent on their own",
      path: ["encrypted"],
    },
  )
  .refine((v) => !v.type || v.encrypted, { message: "`type` is only for encrypted content", path: ["type"] })
  .refine(
    (v) =>
      [v.location, v.checklist, v.game, v.type].filter(Boolean).length === 0 ||
      ([v.location, v.checklist, v.game].filter(Boolean).length <= 1 &&
        v.text === undefined &&
        !v.attachmentId &&
        !v.gifId &&
        !v.stickerId &&
        !v.ephemeral),
    { message: "Locations, checklists and games are sent on their own", path: ["location"] },
  )
  .refine((v) => [v.attachmentId, v.gifId, v.stickerId].filter((x) => x !== undefined).length <= 1, {
    message: "Send one attachment, GIF or sticker at a time",
    path: ["attachmentId"],
  })
  .refine((v) => !v.stickerId || v.text === undefined, { message: "Stickers have no caption", path: ["text"] })
  .refine((v) => !v.effect || v.text !== undefined, { message: "Effects are for text messages", path: ["effect"] })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), {
    message: "Entities fall outside the text",
    path: ["entities"],
  });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

/** Places in a group, whoever created it included. */
export const GROUP_MIN_PLACES = 3;
export const GROUP_MAX_PLACES = 50;
export const GROUP_ROLES = ["owner", "admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const ChatMemberDTO = z.object({
  user: PublicUser.describe("In a group, their nickname and photo there, unless you gave them a name of your own"),
  role: z.enum(GROUP_ROLES).nullable().describe("In a group; null in a direct chat"),
  lastDeliveredMessageId: Id.nullable(),
  lastDeliveredAt: IsoDate.nullable(),
  lastReadMessageId: Id.nullable(),
  lastReadAt: IsoDate.nullable(),
});
export type ChatMemberDTO = z.infer<typeof ChatMemberDTO>;

export const ChatDTO = z.object({
  id: Id,
  type: z.enum(["direct", "group"]),
  title: z.string(),
  group: z
    .object({
      photoUrl: z.string().nullable(),
      description: z.string().nullable(),
      inviteCode: z
        .string()
        .nullable()
        .describe("The code in the group's link, the only way in; null for members when only admins may share it"),
      maxMembers: z.number().int(),
      membersCanWrite: z.boolean().describe("Off: only the owner and admins send messages; members read and react"),
      membersCanInvite: z.boolean().describe("Off: only the owner and admins see the group's link"),
      myRole: z.enum(GROUP_ROLES),
    })
    .nullable()
    .describe("Set on a group"),
  members: z.array(ChatMemberDTO),
  lastMessage: MessageDTO.nullable(),
  unreadCount: z.number().int(),
  archived: z.boolean(),
  muted: z.boolean(),
  mutedUntil: IsoDate.nullable().describe("When a timed mute ends; null while muted for good or not muted"),
  pinned: z.boolean(),
  safeView: z.boolean().describe("Your setting: blur the photos and videos in the chat, yours included, until you tap them"),
  autoDeleteSecs: z
    .number()
    .int()
    .nullable()
    .describe("Shared by both people: new messages are deleted for everyone this long after they are sent"),
  vanish: z
    .boolean()
    .describe(
      "Vanish mode, shared by both people: messages sent while it is on disappear once the other person has seen them and left the chat",
    ),
  theme: z
    .string()
    .nullable()
    .describe("Chat background shared by both people (an id from CHAT_THEMES); null uses each person's default"),
  pinnedMessages: z
    .array(MessageDTO)
    .describe(`Shared by both people: the messages pinned at the top of the chat, newest pin first, at most ${PIN_LIMIT}`),
  scheduledCount: z.number().int().describe("Your scheduled messages waiting to be sent in this chat"),
  draft: z
    .object({
      text: z.string().nullable().describe("Plain text; null when cleared, or when it is sealed"),
      sealed: z.string().nullable().describe("Sealed with your backup key, so only your devices can read it"),
      at: IsoDate,
    })
    .nullable()
    .describe("Just yours: what you were typing here, saved by one of your devices for the others; null until one does"),
  blockedByMe: z.boolean().describe("You blocked the other person: nobody can send, react or edit until you unblock"),
  blockedByThem: z.boolean().describe("The other person blocked you"),
  peerDeleted: z.boolean().describe("The other person deleted their account"),
  encrypted: z
    .boolean()
    .describe("Messages here are end-to-end encrypted from now on; sending plain text is refused (ENCRYPTION_REQUIRED)"),
  support: z
    .boolean()
    .describe("A support chat with a guest from the support page: only text, photos and replies can be sent, and nobody can call"),
  supportDesk: z
    .boolean()
    .describe("You answer this chat for support; the person you're helping sees you as Six Frites"),
  withSupport: z
    .boolean()
    .describe("Your chat with Six Frites support: no calls, no presence, and text and photos only"),
  supportClosedAt: IsoDate.nullable().describe("When support closed this conversation; the next message opens it again"),
  lastActivityAt: IsoDate,
  createdAt: IsoDate,
});
export type ChatDTO = z.infer<typeof ChatDTO>;

/** Nobody can write here: one of you blocked the other, or they deleted their account. */
export const isFrozen = (c: ChatDTO) => c.blockedByMe || c.blockedByThem || c.peerDeleted;

export const CHAT_FILTERS = ["all", "unread", "read"] as const;
export type ChatFilter = (typeof CHAT_FILTERS)[number];

/** Whether a chat shows under one of the chat list's filters. */
export const inChatFilter = (c: ChatDTO, filter: ChatFilter) =>
  filter === "unread" ? c.unreadCount > 0 : filter === "read" ? c.unreadCount === 0 : true;

export const ChatListQuery = z.object({
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ChatListQuery = z.infer<typeof ChatListQuery>;

export const MarkReadInput = z.object({
  messageId: Id.optional(),
});
export type MarkReadInput = z.infer<typeof MarkReadInput>;

export const MarkDeliveredInput = MarkReadInput.extend({
  at: IsoDate.optional().describe("When `messageId` reached this device, on the server's clock. Defaults to now"),
});
export type MarkDeliveredInput = z.infer<typeof MarkDeliveredInput>;

export const MessageTimingDTO = z.object({
  sentAt: IsoDate.nullable().describe("When the sender pressed send; null from older apps"),
  serverAt: IsoDate.describe("When the server stored it"),
  arrivedAt: IsoDate.nullable().describe("When it first reached a recipient's device; null until then"),
});
export type MessageTimingDTO = z.infer<typeof MessageTimingDTO>;

/** The legs of a message's trip in milliseconds, null where a time is missing. */
export function messageTrip(t: MessageTimingDTO) {
  const server = Date.parse(t.serverAt);
  const sent = t.sentAt ? Date.parse(t.sentAt) : null;
  const arrived = t.arrivedAt ? Date.parse(t.arrivedAt) : null;
  return {
    up: sent === null ? null : server - sent,
    down: arrived === null ? null : arrived - server,
    total: sent === null || arrived === null ? null : arrived - sent,
  };
}

export const latencyLabel = (ms: number) =>
  ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;

export const ChatDeliveredDTO = z.object({
  chatId: Id,
  userId: Id,
  lastDeliveredMessageId: Id,
  lastDeliveredAt: IsoDate,
});
export type ChatDeliveredDTO = z.infer<typeof ChatDeliveredDTO>;

/** What a member is busy with in the composer. Older clients leave it out, which means "text". */
export const TypingKind = z.enum(["text", "voice", "video", "photo"]);
export type TypingKind = z.infer<typeof TypingKind>;

export const TypingInput = z.object({ chatId: Id, typing: z.boolean(), kind: TypingKind.optional() });
export type TypingInput = z.infer<typeof TypingInput>;

export const TypingDTO = TypingInput.extend({ userId: Id });
export type TypingDTO = z.infer<typeof TypingDTO>;

export const ChatReadDTO = z.object({
  chatId: Id,
  userId: Id,
  lastReadMessageId: Id,
  lastReadAt: IsoDate,
});
export type ChatReadDTO = z.infer<typeof ChatReadDTO>;

export const UpdateChatInput = z
  .object({
    archived: z.boolean().optional(),
    muted: z.boolean().optional(),
    mutedUntil: IsoDate.nullable()
      .optional()
      .describe("With `muted: true`, unmute on its own at this time. Leave out or null to stay muted."),
    pinned: z.boolean().optional(),
    safeView: z.boolean().optional().describe("Just for you: blur the photos and videos the other person sends"),
    vanish: z.boolean().optional().describe("For both people: turn vanish mode on or off"),
    pin: Id.optional().describe(`For both people: pin this message. Past ${PIN_LIMIT} pins, the oldest is unpinned.`),
    unpin: Id.optional().describe("For both people: unpin this message"),
    draft: z
      .union([z.object({ text: z.string().max(4000) }), z.object({ sealed: z.string().max(12000) })])
      .nullable()
      .optional()
      .describe("Just for you: what you are typing, so your other devices show it too. null clears it."),
    autoDeleteSecs: z
      .number()
      .int()
      .min(AUTO_DELETE.min)
      .max(AUTO_DELETE.max)
      .nullable()
      .optional()
      .describe(
        "For both people: delete messages sent from now on this many seconds after sending. null turns it off.",
      ),
    theme: z
      .string()
      .refine(isChatThemeId, "Unknown chat theme")
      .nullable()
      .optional()
      .describe("For both people: the chat background, a theme id or custom:#rrggbb. null goes back to each person's default."),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one field");
export type UpdateChatInput = z.infer<typeof UpdateChatInput>;

export const DeleteChatQuery = z
  .object({
    scope: DeleteScope.default("me"),
    from: IsoDate.optional().describe("Only delete the messages sent from this time on, instead of the whole chat"),
    to: IsoDate.optional().describe("Only delete the messages sent up to this time, instead of the whole chat"),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "`from` must not be after `to`",
    path: ["from"],
  });
export type DeleteChatQuery = z.infer<typeof DeleteChatQuery>;

/** "Delete chat" shortcuts for the messages sent in the last hour, day or week. */
export const DELETE_RANGE_PRESETS = [
  { label: "deleteLastHour", secs: 3600 },
  { label: "deleteLastDay", secs: 86400 },
  { label: "deleteLastWeek", secs: 7 * 86400 },
] as const;

/** DeleteChatQuery's `from` and `to` covering two whole local days and every day between, in either order. */
export function dayRange(a: Date, b: Date) {
  const [first, last] = a <= b ? [a, b] : [b, a];
  const from = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1, 0, 0, 0, -1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const ChatDeletedDTO = z.object({ chatId: Id, scope: DeleteScope });
export type ChatDeletedDTO = z.infer<typeof ChatDeletedDTO>;

/** Offered in the quick reaction bar; any other single emoji can be picked too. */
export const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"] as const;

export const ReactionEmoji = z
  .string()
  .max(32)
  .regex(
    /^(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]|\u200D\p{Extended_Pictographic})*)$/u,
    "Expected a single emoji",
  );

export const MessageReactedDTO = z.object({
  chatId: Id,
  messageId: Id,
  userId: Id.describe("Who reacted"),
  emoji: z.string().describe("What to show: the emoji, a sticker's emoji, or GIF"),
});
export type MessageReactedDTO = z.infer<typeof MessageReactedDTO>;

/** How many different emoji one person can put on one message. */
export const MAX_REACTIONS_PER_USER = 10;

/** What removes a sticker or GIF reaction: `sticker:<id>` or `gif:<id>`. */
export const ReactionKey = z.string().regex(/^(?:sticker|gif):[\w-]{1,128}$/, "Expected sticker:<id> or gif:<id>");

export const ReactInput = z
  .object({
    emoji: ReactionEmoji.optional(),
    stickerId: Id.optional().describe("React with this sticker"),
    gifId: z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .describe("React with this GIF from GET /v1/gifs"),
  })
  .refine((v) => [v.emoji, v.stickerId, v.gifId].filter((x) => x !== undefined).length === 1, {
    message: "React with one emoji, sticker or GIF",
  });
export type ReactInput = z.infer<typeof ReactInput>;

/** How a reaction reads in a notification: its emoji, a sticker's emoji, or GIF. */
export function reactionGlyph(r: { emoji: string; sticker?: { emoji: string } | null; gif?: unknown }) {
  if (r.emoji.startsWith("sticker:")) return r.sticker?.emoji ?? "🖼️";
  if (r.emoji.startsWith("gif:")) return "GIF";
  return r.emoji;
}

export const CheckItemInput = z.object({ done: z.boolean() });
export type CheckItemInput = z.infer<typeof CheckItemInput>;

export const ViewMessageResult = z.object({
  message: MessageDTO,
  expiresAt: IsoDate.nullable().describe("When the content will be destroyed, if a timer is running"),
});
export type ViewMessageResult = z.infer<typeof ViewMessageResult>;

/** How many messages one person can have waiting in a chat, and how far ahead they can be scheduled. */
export const SCHEDULE_LIMITS = { perChat: 100, maxAheadSeconds: 365 * 24 * 60 * 60 } as const;

export const ScheduleMessageInput = SendMessageInput.safeExtend({
  sendAt: IsoDate.describe("When to send it, in the future and at most a year ahead"),
})
  .refine((v) => !v.game && v.type !== "game", { message: "Games are played now, not scheduled", path: ["game"] })
  .refine((v) => !v.bump, { message: "Bumps are sent now, not scheduled", path: ["bump"] })
  .refine((v) => !v.storyId, { message: "Stories are answered now, not scheduled", path: ["storyId"] });
export type ScheduleMessageInput = z.infer<typeof ScheduleMessageInput>;

export const ScheduledMessageDTO = z.object({
  id: Id,
  chatId: Id,
  clientId: z.string().describe("Becomes the clientId of the message once it is sent"),
  type: MessageType,
  text: z.string().nullable(),
  entities: z.array(MessageEntity),
  spoiler: z.boolean(),
  attachment: AttachmentDTO.nullable(),
  ephemeral: z.object({ maxViews: z.number().int().nullable(), ttlSeconds: z.number().int().nullable() }).nullable(),
  replyTo: ReplyPreview.nullable(),
  sendAt: IsoDate,
  createdAt: IsoDate,
  encryption: EncryptionDTO.nullable(),
});
export type ScheduledMessageDTO = z.infer<typeof ScheduledMessageDTO>;

export const EditScheduledInput = z
  .object({
    text: MessageText.optional(),
    entities: Entities.optional().describe("Replaces the formatting; send it together with text"),
    encrypted: EncryptedInput.optional().describe("Replaces the encrypted content of an encrypted scheduled message"),
    sendAt: IsoDate.optional(),
  })
  .refine(
    (v) => v.text !== undefined || v.encrypted !== undefined || v.sendAt !== undefined,
    "Provide text or encrypted content, sendAt, or both",
  )
  .refine((v) => v.text === undefined || v.encrypted === undefined, {
    message: "Send either text or encrypted content",
    path: ["encrypted"],
  })
  .refine((v) => v.text !== undefined || v.entities === undefined, {
    message: "Send entities together with text",
    path: ["entities"],
  })
  .refine((v) => entitiesFit(v.text ?? "", v.entities), {
    message: "Entities fall outside the text",
    path: ["entities"],
  });
export type EditScheduledInput = z.infer<typeof EditScheduledInput>;

export const ThreadInput = z.object({ closed: z.boolean().describe("Close the comments, or reopen them") });
export type ThreadInput = z.infer<typeof ThreadInput>;
