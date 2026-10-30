import { GUESS_MAX, RPS_HANDS } from "./calls.js";
import {
  BOARDS,
  type ChatGame,
  type GameKind,
  type GameMove,
  type GameMoveDTO,
  PENALTY_KICKS,
  PENALTY_SIDES,
  boardGame,
  hangmanWord,
  lineOf,
  randomFleet,
} from "./games.js";
import type { Locale } from "./i18n/index.js";

/** Who the bot is in a game played against it, which never leaves the device. */
export const BOT_ID = "bot";

/** The games the bot can start: it can't write statements or riddles, nor read a typed guess. */
export const BOT_GAMES = ["rps", "dice", "guess", "penalty", "hangman", "ships", "ttt", "four"] as const satisfies GameKind[];
export type BotGame = (typeof BOT_GAMES)[number];

export const isBotGame = (g: GameKind): g is BotGame => (BOT_GAMES as readonly GameKind[]).includes(g);

export const BOT_WORDS: Record<Locale, string[]> = {
  en: [
    "fries", "burger", "pizza", "pancake", "sandwich", "ketchup", "mustard", "cheese", "banana", "pineapple",
    "coconut", "mango", "avocado", "chocolate", "cookie", "donut", "popcorn", "noodles", "sushi", "taco",
    "potato", "tomato", "onion", "garlic", "carrot", "lemon", "orange", "strawberry", "cherry", "waffle",
    "yogurt", "butter", "honey", "vanilla", "cinnamon", "omelette", "sausage", "chicken", "salad", "muffin",
    "cupcake", "pretzel", "lemonade", "milkshake", "spaghetti", "lasagna",
  ],
  fr: [
    "frites", "baguette", "croissant", "fromage", "chocolat", "crêpe", "gaufre", "beignet", "tomate", "oignon",
    "carotte", "banane", "ananas", "mangue", "citron", "fraise", "cerise", "pomme", "poire", "orange",
    "saucisse", "poulet", "salade", "omelette", "confiture", "miel", "beurre", "yaourt", "vanille", "cannelle",
    "moutarde", "mayonnaise", "ketchup", "patate", "nouilles", "brioche", "madeleine", "éclair", "pamplemousse",
    "limonade", "café", "gâteau", "bonbon", "biscuit",
  ],
  mg: [
    "vary", "laoka", "ravitoto", "romazava", "mofo", "mofogasy", "akondro", "mananasy", "voanio", "sakay",
    "tantely", "ronono", "atody", "hena", "trondro", "voatabia", "tongolo", "sira", "siramamy", "kafe",
    "dite", "akoho", "gana", "kisoa", "omby", "voanjo", "tsaramaso", "manga", "voasary", "koba",
    "saosisy", "sakafo", "lasary", "masikita", "sambosa", "karaoty", "ovy", "mamy", "voankazo",
  ],
};

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const roll = (sides: number) => Math.floor(Math.random() * sides);

/** The bot's side of a new game: its hand, die, number, kicks, word, boats or first move. */
export function botGame(kind: BotGame, locale: Locale): ChatGame {
  const kicks = () => Array.from({ length: PENALTY_KICKS }, () => pick(PENALTY_SIDES));
  switch (kind) {
    case "rps":
      return { game: "rps", hand: pick(RPS_HANDS) };
    case "dice":
      return { game: "dice", pick: 1 + roll(6), seed: roll(6) };
    case "guess":
      return { game: "guess", secret: 1 + roll(GUESS_MAX) };
    case "penalty":
      return { game: "penalty", shots: kicks(), dives: kicks() };
    case "hangman":
      return { game: "hangman", word: hangmanWord(pick(BOT_WORDS[locale])) };
    case "ships":
      return { game: "ships", boats: randomFleet() };
    case "ttt":
      return { game: "ttt", cell: pick([0, 2, 4, 6, 8]) };
    case "four":
      return { game: "four", col: Math.floor(BOARDS.four.width / 2) };
  }
}

type BoardKind = "ttt" | "four";

function landing(kind: BoardKind, board: (0 | 1 | null)[], n: number) {
  const { width, height } = BOARDS[kind];
  if (kind === "ttt") return board[n] === null ? n : -1;
  for (let y = height - 1; y >= 0; y--) if (board[y * width + n] === null) return y * width + n;
  return -1;
}

function play(kind: BoardKind, board: (0 | 1 | null)[], n: number, player: 0 | 1) {
  const next = [...board];
  next[landing(kind, board, n)] = player;
  return next;
}

const openings = (kind: BoardKind, board: (0 | 1 | null)[]) =>
  Array.from({ length: kind === "ttt" ? 9 : BOARDS.four.width }, (_, n) => n).filter((n) => landing(kind, board, n) >= 0);

function wins(kind: BoardKind, board: (0 | 1 | null)[], n: number, player: 0 | 1) {
  const { width, height, line } = BOARDS[kind];
  return lineOf(play(kind, board, n, player), width, height, line)?.player === player;
}

const TTT_RANK = [1, 2, 1, 2, 0, 2, 1, 2, 1];

/**
 * The bot's next move when it's its turn on the board: a winning one, else one that blocks a win, else
 * one that doesn't hand over a win, the most central first with a little luck between equals.
 * ponytail: looks one move ahead, so forks beat it; add a minimax search if it should play perfectly.
 */
export function botBoardMove(game: Extract<ChatGame, { game: BoardKind }>, moves: GameMoveDTO[]): GameMove | null {
  const kind = game.game;
  const g = boardGame(game, BOT_ID, moves);
  if (g.over || g.turn !== 0 || !g.opponent) return null;
  const options = openings(kind, g.board);
  const safe = options.filter((n) => {
    const after = play(kind, g.board, n, 0);
    return !openings(kind, after).some((m) => wins(kind, after, m, 1));
  });
  const rank = (n: number) => (kind === "ttt" ? TTT_RANK[n]! : Math.abs(n - Math.floor(BOARDS.four.width / 2)));
  const best =
    options.find((n) => wins(kind, g.board, n, 0)) ??
    options.find((n) => wins(kind, g.board, n, 1)) ??
    (safe.length ? safe : options)
      .map((n) => ({ n, score: rank(n) + Math.random() }))
      .sort((a, b) => a.score - b.score)[0]!.n;
  return kind === "ttt" ? { cell: best } : { col: best };
}
