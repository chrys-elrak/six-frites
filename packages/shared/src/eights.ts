import { z } from "zod";

/** Cards are 0 to 51: suit ♠ ♥ ♦ ♣ is card / 13, rank A 2 … 10 J Q K is card % 13. */
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const cardSuit = (card: number) => Math.floor(card / 13);
export const cardRank = (card: number) => card % 13;

const ACE = 0;
const TWO = 1;
const EIGHT = 7;
const JACK = 10;

export interface EightsState {
  hands: number[][];
  draw: number[];
  pile: number[];
  /** The suit to follow: the top card's, or the one called with an 8. */
  suit: number;
  turn: number;
  dir: 1 | -1;
  /** Whether the player whose turn it is has drawn already, so they may pass. */
  drawn: boolean;
  /** Passes in a row with nothing left to draw; once everyone has, the fewest cards wins. */
  stuck: number;
  winner: number | null;
  last: { seat: number; play?: number; drew?: number; passed?: boolean } | null;
}

export const EightsMove = z.union([
  z.object({ play: z.number().int().min(0).max(51), suit: z.number().int().min(0).max(3).optional() }),
  z.object({ draw: z.literal(true) }),
  z.object({ pass: z.literal(true) }),
]);
export type EightsMove = z.infer<typeof EightsMove>;

/** What one player sees: their own hand, how many cards everyone else holds. */
export interface EightsView extends Omit<EightsState, "hands" | "draw"> {
  hand: number[];
  counts: number[];
  drawCount: number;
}

function shuffle<T>(items: T[], rng: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Seven cards each for two players, five for more. */
export function eightsStart(players: number, rng: () => number): EightsState {
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const size = players === 2 ? 7 : 5;
  const hands = Array.from({ length: players }, (_, p) => deck.slice(p * size, (p + 1) * size));
  const top = deck[players * size]!;
  return {
    hands,
    draw: deck.slice(players * size + 1),
    pile: [top],
    suit: cardSuit(top),
    turn: 0,
    dir: 1,
    drawn: false,
    stuck: 0,
    winner: null,
    last: null,
  };
}

/** Whether a card can go on the pile: an 8 always, otherwise the suit to follow or the top card's rank. */
export function eightsFits(s: Pick<EightsState, "pile" | "suit">, card: number) {
  return cardRank(card) === EIGHT || cardSuit(card) === s.suit || cardRank(card) === cardRank(s.pile.at(-1)!);
}

const step = (s: EightsState, seat: number, by = 1) => (((seat + s.dir * by) % s.hands.length) + s.hands.length) % s.hands.length;

/** Takes `n` cards off the draw pile, shuffling the played cards back in under the top one when it runs out. */
function take(s: EightsState, n: number, rng: () => number) {
  let { draw, pile } = s;
  const got: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!draw.length && pile.length > 1) {
      draw = shuffle(pile.slice(0, -1), rng);
      pile = pile.slice(-1);
    }
    if (!draw.length) break;
    got.push(draw[0]!);
    draw = draw.slice(1);
  }
  return { draw, pile, got };
}

/**
 * Plays a card, draws one, or passes after drawing. An 8 calls a suit; an ace turns play around
 * (between two players, you go again); a jack skips the next player; a 2 makes them draw two and
 * skips them.
 */
export function eightsPlay(s: EightsState, seat: number, move: EightsMove, rng: () => number): EightsState | null {
  if (s.winner !== null || seat !== s.turn) return null;
  if ("draw" in move) {
    if (s.drawn) return null;
    const { draw, pile, got } = take(s, 1, rng);
    const hands = s.hands.map((h, i) => (i === seat ? [...h, ...got] : h));
    return { ...s, hands, draw, pile, drawn: true, last: { seat, drew: got.length } };
  }
  if ("pass" in move) {
    if (!s.drawn) return null;
    const stuck = !s.draw.length && s.pile.length <= 1 ? s.stuck + 1 : 0;
    const fewest = s.hands.reduce((best, h, i) => (h.length < s.hands[best]!.length ? i : best), 0);
    if (stuck >= s.hands.length) return { ...s, stuck, winner: fewest, last: { seat, passed: true } };
    return { ...s, turn: step(s, seat), drawn: false, stuck, last: { seat, passed: true } };
  }
  const card = move.play;
  if (!s.hands[seat]!.includes(card) || !eightsFits(s, card)) return null;
  const rank = cardRank(card);
  if (rank === EIGHT && move.suit === undefined) return null;
  let next: EightsState = {
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h)),
    pile: [...s.pile, card],
    suit: rank === EIGHT ? move.suit! : cardSuit(card),
    drawn: false,
    stuck: 0,
    last: { seat, play: card },
  };
  if (!next.hands[seat]!.length) return { ...next, winner: seat };
  if (rank === ACE) next = { ...next, dir: next.dir === 1 ? -1 : 1 };
  if (rank === ACE && s.hands.length === 2) return { ...next, turn: seat };
  if (rank === TWO) {
    const victim = step(next, seat);
    const { draw, pile, got } = take(next, 2, rng);
    next = { ...next, draw, pile, hands: next.hands.map((h, i) => (i === victim ? [...h, ...got] : h)) };
  }
  return { ...next, turn: step(next, seat, rank === TWO || rank === JACK ? 2 : 1) };
}

/** A sensible move for a bot or someone out of time: follow with the suit held most, keep 8s for last, else draw, else pass. */
export function eightsAuto(s: EightsState, seat: number): EightsMove | null {
  if (s.winner !== null || seat !== s.turn) return null;
  const hand = s.hands[seat]!;
  const held = (suit: number) => hand.filter((c) => cardSuit(c) === suit && cardRank(c) !== EIGHT).length;
  const favourite = [0, 1, 2, 3].reduce((best, suit) => (held(suit) > held(best) ? suit : best), 0);
  const fits = hand.filter((c) => eightsFits(s, c));
  const plain = fits.filter((c) => cardRank(c) !== EIGHT).sort((a, b) => held(cardSuit(b)) - held(cardSuit(a)));
  if (plain.length) return { play: plain[0]! };
  if (fits.length) return { play: fits[0]!, suit: favourite };
  return s.drawn ? { pass: true } : { draw: true };
}

export function eightsView(s: EightsState, seat: number | null): EightsView {
  const { hands, draw, ...shared } = s;
  return { ...shared, hand: seat === null ? [] : hands[seat]!, counts: hands.map((h) => h.length), drawCount: draw.length };
}
