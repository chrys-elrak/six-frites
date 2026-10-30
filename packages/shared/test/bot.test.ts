import { describe, expect, it } from "vitest";
import {
  BOT_GAMES,
  BOT_ID,
  BOT_WORDS,
  type ChatGame,
  ChatGame as ChatGameSchema,
  type GameMoveDTO,
  LOCALES,
  boardGame,
  botBoardMove,
  botGame,
  hangmanWord,
} from "../src/index.js";

const me = "me";
const at = "2026-10-30T00:00:00.000Z";
const moves = (...cells: [string, number][]): GameMoveDTO[] => cells.map(([userId, cell]) => ({ userId, move: { cell }, at }));

describe("botGame", () => {
  it("starts every game it plays in a shape the chat accepts", () => {
    for (const locale of LOCALES) for (const kind of BOT_GAMES) expect(ChatGameSchema.safeParse(botGame(kind, locale)).success).toBe(true);
  });

  it("only knows hangman words that fit", () => {
    for (const l of LOCALES) for (const w of BOT_WORDS[l]) expect(hangmanWord(w)).toMatch(/^[A-Z]{3,16}$/);
  });
});

describe("botBoardMove", () => {
  const ttt: Extract<ChatGame, { game: "ttt" }> = { game: "ttt", cell: 0 };

  it("takes a win", () => {
    expect(botBoardMove(ttt, moves([me, 3], [BOT_ID, 1], [me, 4]))).toEqual({ cell: 2 });
  });

  it("blocks a win", () => {
    expect(botBoardMove(ttt, moves([me, 4], [BOT_ID, 8], [me, 3]))).toEqual({ cell: 5 });
  });

  it("waits for its turn", () => {
    expect(botBoardMove(ttt, [])).toBeNull();
  });

  it("finishes every game against random moves", () => {
    for (const kind of ["ttt", "four"] as const) {
      for (let round = 0; round < 50; round++) {
        const game = botGame(kind, "en") as Extract<ChatGame, { game: "ttt" | "four" }>;
        const played: GameMoveDTO[] = [];
        for (let i = 0; i < 60 && !boardGame(game, BOT_ID, played).over; i++) {
          const bot = botBoardMove(game, played);
          const n = Math.floor(Math.random() * (kind === "ttt" ? 9 : 7));
          played.push({ userId: bot ? BOT_ID : me, move: bot ?? (kind === "ttt" ? { cell: n } : { col: n }), at });
        }
        expect(boardGame(game, BOT_ID, played).over).toBe(true);
      }
    }
  });
});
