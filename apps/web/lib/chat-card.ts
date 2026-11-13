import { aliasAvatar } from "@six/shared";

const W = 1080;
const H = 1920;
const MAX_W = 880;
const PAD_X = 52;
const PAD_Y = 34;
const SIZE = 54;
const LINE = 72;
const LINES = 6;
const AVATAR = 76;
const FONT = 'ui-sans-serif, system-ui, sans-serif, "Noto Color Emoji", "Apple Color Emoji"';

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (line && ctx.measureText(line + word).width > width) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line += word;
      while (ctx.measureText(line).width > width) {
        let i = line.length - 1;
        while (i > 1 && ctx.measureText(line.slice(0, i)).width > width) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    out.push(line);
  }
  if (out.length <= LINES) return out;
  let last = out[LINES - 1]!;
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  return [...out.slice(0, LINES - 1), `${last}…`];
}

async function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, user: { displayName: string; avatarUrl: string | null; alias?: string }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();
  const photo = user.avatarUrl ? await fetch(user.avatarUrl).then((r) => r.blob()).then(createImageBitmap).catch(() => null) : null;
  const alias = aliasAvatar(user.alias ?? user.displayName);
  if (photo) ctx.drawImage(photo, x, y, AVATAR, AVATAR);
  else {
    ctx.fillStyle = alias ? alias.gradient.slice(16, 23) : getComputedStyle(document.documentElement).getPropertyValue("--color-brand") || "#f59e0b";
    ctx.fillRect(x, y, AVATAR, AVATAR);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-ink") || "#3f2a12";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${alias ? 40 : 34}px ${FONT}`;
    ctx.fillText(alias ? alias.food : user.displayName.slice(0, 1).toUpperCase(), x + AVATAR / 2, y + AVATAR / 2 + 2);
  }
  ctx.restore();
}

/**
 * Draws a chat message shared to a story as a story-sized JPEG: who sent it, the bubble and when, over the story
 * background. Posted as the story's picture, so viewers see the card exactly as the poster did and nothing else.
 */
export async function chatCardJpeg(card: {
  text: string;
  bubble: string;
  background: string;
  from: { displayName: string; avatarUrl: string | null; alias?: string } | null;
  name: string;
  when: string | null;
  label: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const [from, to] = card.background.split(",");
  if (to) {
    const g = ctx.createLinearGradient(W * 0.33, 0, W * 0.67, H);
    g.addColorStop(0, from!);
    g.addColorStop(1, to);
    ctx.fillStyle = g;
  } else ctx.fillStyle = from!;
  ctx.fillRect(0, 0, W, H);

  ctx.font = `${SIZE}px ${FONT}`;
  const lines = wrap(ctx, card.text, MAX_W - PAD_X * 2);
  const bubbleW = Math.min(MAX_W, Math.max(...lines.map((l) => ctx.measureText(l).width), card.when ? 300 : 0) + PAD_X * 2);
  const bubbleH = PAD_Y * 2 + lines.length * LINE + (card.when ? 44 : 0);
  const header = card.from ? AVATAR + 20 : 0;
  const x = (W - MAX_W) / 2;
  let y = (H - (header + bubbleH + 80)) / 2;

  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 12;
  if (card.from) {
    await drawAvatar(ctx, x, y, card.from);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `600 38px ${FONT}`;
    ctx.fillText(card.name, x + AVATAR + 20, y + AVATAR / 2, MAX_W - AVATAR - 20);
    y += header;
  }

  const [bg, ink] = card.bubble.split(",");
  ctx.shadowBlur = 30;
  ctx.fillStyle = bg!;
  ctx.beginPath();
  ctx.roundRect(x, y, bubbleW, bubbleH, 76);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = ink!;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${SIZE}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, x + PAD_X, y + PAD_Y + i * LINE + 6));
  if (card.when) {
    ctx.globalAlpha = 0.7;
    ctx.textAlign = "right";
    ctx.font = `30px ${FONT}`;
    ctx.fillText(card.when, x + bubbleW - PAD_X, y + PAD_Y + lines.length * LINE + 8);
    ctx.globalAlpha = 1;
  }
  y += bubbleH + 28;

  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "left";
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(`💬 ${card.label}`, x + 24, y);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
}
