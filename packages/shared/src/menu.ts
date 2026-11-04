interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a message's reaction bar goes while its long-press menu is open, Messenger style: right on top of the message
 * and lined up with its side, or under it when there's no room above, always between `screen.top` and `screen.bottom`.
 */
export function placeReactionBar(
  message: Box,
  bar: { width: number; height: number },
  screen: { top: number; bottom: number; width: number },
  mine: boolean,
) {
  const gap = 6;
  const above = message.y - gap - bar.height;
  const top = above >= screen.top ? above : message.y + message.height + gap;
  const left = mine ? message.x + message.width - bar.width : message.x;
  return {
    top: Math.max(screen.top, Math.min(top, screen.bottom - bar.height)),
    left: Math.min(Math.max(8, left), screen.width - bar.width - 8),
  };
}

interface Size {
  width: number;
  height: number;
}

/**
 * Where a message's long-press menu goes on a wide screen, Messenger style: the reaction bar sits right on top of the
 * message and the actions card right under it, lined up with the message's side. Without room above, the bar goes under the message;
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
