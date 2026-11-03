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
