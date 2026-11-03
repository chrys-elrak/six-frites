interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Where a message's long-press menu goes, Messenger style: the reaction bar sits right on top of the message and the
 * actions card right under it, lined up with the message's side. Without room above, the bar goes under the message;
 * without room under, the card goes above the message and bar. Everything stays between `screen.top` and `screen.bottom`.
 */
export function placeMessageMenu(
  message: Box,
  bar: Size | null,
  card: Size,
  screen: { top: number; bottom: number; width: number },
  mine: boolean,
) {
  const gap = 6;
  const left = (s: Size) => Math.min(Math.max(8, mine ? message.x + message.width - s.width : message.x), screen.width - s.width - 8);
  const clamp = (top: number, s: Size) => Math.max(screen.top, Math.min(top, screen.bottom - s.height));

  let above = message.y - gap;
  let below = message.y + message.height + gap;
  let barTop = 0;
  if (bar && above - bar.height >= screen.top) {
    barTop = above - bar.height;
    above = barTop - gap;
  } else if (bar) {
    barTop = below;
    below += bar.height + gap;
  }
  const cardTop = below + card.height <= screen.bottom ? below : above - card.height;

  return {
    bar: bar && { top: clamp(barTop, bar), left: left(bar) },
    card: { top: clamp(cardTop, card), left: left(card) },
  };
}
