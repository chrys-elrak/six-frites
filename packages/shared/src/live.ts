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

export interface LiveSeatDTO {
  /** null for Frite Bot, or for a bot playing the seat of someone who left. */
  user: PublicUser | null;
  left: boolean;
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
}

export interface LiveInviteDTO {
  roomId: string;
  game: LiveGame;
  from: PublicUser;
}
