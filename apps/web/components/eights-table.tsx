"use client";

import { type EightsMove, type EightsView, RANKS, SUITS, cardRank, cardSuit, eightsFits } from "@six/shared";
import { useState } from "react";
import { useT } from "@/lib/i18n";

const red = (suit: number) => suit === 1 || suit === 2;

function Card({ card, size = "md" }: { card: number; size?: "sm" | "md" | "lg" }) {
  const suit = cardSuit(card);
  const box = { sm: "h-16 w-11 text-sm", md: "h-24 w-16 text-base", lg: "h-28 w-20 text-lg" }[size];
  return (
    <span
      className={`relative flex flex-col justify-between rounded-lg bg-white p-1.5 font-bold shadow ring-1 ring-black/10 ${box} ${red(suit) ? "text-red-600" : "text-stone-900"}`}
    >
      <span className="leading-none">
        {RANKS[cardRank(card)]}
        {SUITS[suit]}
      </span>
      <span className="self-center text-[2em] leading-none">{SUITS[suit]}</span>
      <span className="rotate-180 leading-none">
        {RANKS[cardRank(card)]}
        {SUITS[suit]}
      </span>
    </span>
  );
}

const back = "rounded-lg bg-gradient-to-br from-brand to-orange-700 ring-2 ring-white shadow";

export function EightsTable({
  state,
  mySeat,
  nameOf,
  play,
}: {
  state: EightsView;
  mySeat: number | null;
  nameOf: (seat: number) => string;
  play: (move: EightsMove) => void;
}) {
  const tr = useT();
  const [wild, setWild] = useState<number | null>(null);
  const mine = mySeat !== null && state.turn === mySeat && state.winner === null;
  const top = state.pile.at(-1)!;
  const others = state.counts.flatMap((n, seat) => (seat === mySeat ? [] : [{ seat, n }]));

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex flex-wrap justify-center gap-5">
        {others.map(({ seat, n }) => (
          <div key={seat} className={`flex flex-col items-center gap-1 ${state.turn === seat ? "" : "opacity-70"}`}>
            <div className="relative h-14" style={{ width: `${2.25 + Math.min(n, 8) * 0.5}rem` }}>
              {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                <span key={i} className={`absolute top-0 h-14 w-9 ${back}`} style={{ left: `${i * 0.5}rem` }} />
              ))}
            </div>
            <span className="text-xs text-stone-500">{nameOf(seat)} · {tr.live.cards(n)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          disabled={!mine || state.drawn}
          onClick={() => play({ draw: true })}
          aria-label={tr.live.draw}
          className={`relative grid h-28 w-20 place-items-center text-sm font-bold text-white transition enabled:hover:-translate-y-1 disabled:opacity-60 ${back}`}
        >
          {state.drawCount}
        </button>
        <span key={state.pile.length} className="reaction-pop">
          <Card card={top} size="lg" />
        </span>
        {state.suit !== cardSuit(top) && (
          <span className={`text-5xl ${red(state.suit) ? "text-red-600" : "text-stone-900 dark:text-stone-100"}`}>
            {SUITS[state.suit]}
          </span>
        )}
      </div>

      <p className="text-sm font-semibold">
        {state.winner !== null ? "" : mine ? tr.live.yourTurn : tr.live.theirTurn(nameOf(state.turn))}
      </p>

      {wild !== null ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium">{tr.live.chooseSuit}</p>
          <div className="flex gap-2">
            {SUITS.map((s, suit) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  play({ play: wild, suit });
                  setWild(null);
                }}
                aria-label={tr.live.suits[suit]}
                className={`grid size-14 place-items-center rounded-xl bg-white text-3xl shadow ring-1 ring-black/10 hover:-translate-y-1 ${red(suit) ? "text-red-600" : "text-stone-900"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        mine &&
        state.drawn && (
          <button
            type="button"
            onClick={() => play({ pass: true })}
            className="rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900"
          >
            {tr.live.pass}
          </button>
        )
      )}

      <div className="flex max-w-full gap-1.5 overflow-x-auto px-2 pt-3 pb-2">
        {state.hand.map((card) => {
          const ok = mine && eightsFits(state, card);
          return (
            <button
              key={card}
              type="button"
              disabled={!ok}
              onClick={() => (cardRank(card) === 7 ? setWild(card) : play({ play: card }))}
              className={`shrink-0 transition ${ok ? "-translate-y-2 hover:-translate-y-3" : mine ? "opacity-50" : ""}`}
            >
              <Card card={card} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
