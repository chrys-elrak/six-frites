import { z } from "zod";
import { Id } from "./common.js";
import type { DotsState } from "./dots.js";
import type { EightsView } from "./eights.js";
import type { FanoronaState } from "./fanorona.js";
import { LOCALES, type Locale } from "./i18n/index.js";
import type { LudoState } from "./ludo.js";
import type { MemoryView } from "./memory.js";
import type { PublicUser } from "./invites.js";
import type { WordsView } from "./word-hunt.js";

/** Games played live in a room, everyone at once, with the server dealing, rolling and keeping time. */
export const LIVE_GAMES = ["fanorona", "ludo", "eights", "words", "dots", "memory"] as const;
export type LiveGame = (typeof LIVE_GAMES)[number];

export const LIVE_EMOJI: Record<LiveGame, string> = {
  fanorona: "⚫",
  ludo: "🎲",
  eights: "🃏",
  words: "🔤",
  dots: "🔳",
  memory: "🎴",
};

/** Each seat's colour, the same in every game: red, green, yellow, blue. */
export const SEAT_COLORS = ["#e53935", "#43a047", "#fdd835", "#1e88e5"];

export const LIVE_SEATS: Record<LiveGame, { min: number; max: number }> = {
  fanorona: { min: 2, max: 2 },
  dots: { min: 2, max: 4 },
  memory: { min: 2, max: 4 },
  ludo: { min: 2, max: 4 },
  eights: { min: 2, max: 4 },
  words: { min: 1, max: 4 },
};

/** How long someone has for their turn before it's played for them. */
export const LIVE_TURN_SECONDS = 25;

export const CreateLiveInput = z.object({
  game: z.enum(LIVE_GAMES),
  invite: z.array(Id).max(3).describe("Contacts asked to join"),
  locale: z.enum(LOCALES).describe("The language word hunt is played in"),
});
export type CreateLiveInput = z.infer<typeof CreateLiveInput>;

export const LiveRoomRef = z.object({ roomId: z.string().min(1).max(64) });
export const LiveBotInput = LiveRoomRef.extend({ add: z.boolean() });
export const LiveMoveInput = LiveRoomRef.extend({ move: z.unknown() });
/** How many lines of chat a room keeps. */
export const LIVE_CHAT_LINES = 30;
/** How long a voice note said in a room can be, and how large its recording. */
export const LIVE_VOICE_MS = 30_000;
export const LIVE_VOICE_BYTES = 512 * 1024;

export const LiveSayInput = LiveRoomRef.extend({
  text: z.string().trim().max(200).default(""),
  gifId: z.string().min(1).max(100).optional().describe("A GIF from GET /v1/gifs"),
  voice: z
    .custom<Uint8Array>((v) => v instanceof Uint8Array && v.byteLength <= LIVE_VOICE_BYTES, "Expected a voice note up to 512 KB")
    .optional()
    .describe("A recorded voice note, sent as binary; the server keeps its first 30 seconds"),
}).refine((v) => [v.text, v.gifId, v.voice].filter(Boolean).length === 1, "Say something, or send one GIF or voice note");
export type LiveSayInput = z.infer<typeof LiveSayInput>;

export interface LiveChatLineDTO {
  user: PublicUser;
  text: string;
  gif: { url: string; width: number | null; height: number | null } | null;
  voice: { url: string; durationMs: number; waveform: number[] } | null;
  at: string;
}

export interface LiveSeatDTO {
  /** null for Frite Bot, or for a bot playing the seat of someone who left. */
  user: PublicUser | null;
  left: boolean;
  /** Gave up: the bot plays the seat out, but it can't win. */
  gaveUp: boolean;
}

export type LiveView =
  | { game: "ludo"; state: LudoState }
  | { game: "eights"; state: EightsView }
  | { game: "words"; state: WordsView }
  | { game: "fanorona"; state: FanoronaState }
  | { game: "dots"; state: DotsState }
  | { game: "memory"; state: MemoryView };

/** A room as one person sees it: hidden cards and other people's words stay hidden until the end. */
export interface LiveRoomDTO {
  id: string;
  game: LiveGame;
  hostId: string;
  locale: Locale;
  status: "lobby" | "playing" | "over";
  seats: LiveSeatDTO[];
  invited: PublicUser[];
  mySeat: number | null;
  /** When the current turn, or the word hunt round, runs out. */
  deadline: string | null;
  winners: number[];
  view: LiveView | null;
  /** What the players said, oldest first. */
  chat: LiveChatLineDTO[];
}

export interface LiveInviteDTO {
  roomId: string;
  game: LiveGame;
  from: PublicUser;
}
