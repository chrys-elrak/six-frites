import type { AskColors } from "@six/shared";
import { getT } from "./i18n";

const W = 1080;
const H = 1920;
const CARD_W = 900;
const PAD = 64;
const HEADER_H = 180;
const MAX_TEXT_H = 900;
const MARGIN = 48;
const LOGO = 72;
const FONT = 'ui-sans-serif, system-ui, sans-serif, "Noto Color Emoji", "Apple Color Emoji"';

export interface CardStyle {
  colors: AskColors;
  /** Just the card on a transparent background, to lay over a photo, instead of a whole story. */
  transparent: boolean;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const ch of Array.from(word)) {
        if (line && ctx.measureText(line + ch).width > width) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

let logo: Promise<HTMLImageElement | null> | undefined;

/** The app icon, loaded once; null if it can't be fetched, so the card is drawn without it. */
function loadLogo() {
  logo ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logo = undefined;
      resolve(null);
    };
    img.src = "/icon-192.png";
  });
  return logo;
}

const gradient = (ctx: CanvasRenderingContext2D, [from, to]: AskColors, x: number, y: number, w: number, h: number) => {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
};

/**
 * Draws an anonymous message as a PNG: the question on a card with a colored header, either alone on a
 * transparent background or on a story-sized page with the link to send more under it.
 */
export async function askCardPng(text: string, link: string, { colors, transparent }: CardStyle) {
  const [icon] = await Promise.all([loadLogo(), document.fonts.ready]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  let size = 84;
  let lines: string[];
  do {
    size -= 4;
    ctx.font = `700 ${size}px ${FONT}`;
    lines = wrap(ctx, text, CARD_W - PAD * 2);
  } while (lines.length * size * 1.25 > MAX_TEXT_H && size > 32);
  const lineH = size * 1.25;
  lines = lines.slice(0, Math.floor(MAX_TEXT_H / lineH));

  const cardH = HEADER_H + PAD * 2 + lines.length * lineH;
  canvas.width = transparent ? CARD_W + MARGIN * 2 : W;
  canvas.height = transparent ? cardH + MARGIN * 2 : H;
  const x = transparent ? MARGIN : (W - CARD_W) / 2;
  const y = transparent ? MARGIN : (H - cardH) / 2 - 80;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!transparent) {
    ctx.fillStyle = gradient(ctx, colors, 0, 0, W, H);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.roundRect(x, y, CARD_W, cardH, 48);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, CARD_W, cardH, 48);
  ctx.clip();
  ctx.fillStyle = gradient(ctx, colors, x, y, CARD_W, HEADER_H);
  ctx.fillRect(x, y, CARD_W, HEADER_H);
  ctx.restore();

  const mid = x + CARD_W / 2;
  const headMid = y + HEADER_H / 2;
  const prompt = getT().ask.prompt;
  ctx.font = `700 46px ${FONT}`;
  const room = CARD_W - PAD * 2 - (icon ? LOGO + 20 : 0);
  const promptW = Math.min(ctx.measureText(prompt).width, room);
  const start = mid - (promptW + (icon ? LOGO + 20 : 0)) / 2;
  if (icon) ctx.drawImage(icon, start, headMid - LOGO / 2, LOGO, LOGO);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(prompt, start + (icon ? LOGO + 20 : 0), headMid, room);
  ctx.textAlign = "center";

  ctx.fillStyle = "#1c1917";
  ctx.font = `700 ${size}px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, mid, y + HEADER_H + PAD + lineH * (i + 0.5)));

  if (!transparent) {
    ctx.fillStyle = "#1c1917";
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText("Six Frites", mid, y + cardH + 110);
    ctx.fillStyle = "#57534e";
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(link.replace(/^https?:\/\//, ""), mid, y + cardH + 170, CARD_W);
  }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/**
 * Opens the share sheet with the image, where Instagram, Facebook, TikTok and the like offer to post it as a
 * story. Where files can't be shared, such as most desktop browsers, it downloads the image instead.
 */
export async function shareAskCard(blob: Blob) {
  const file = new File([blob], "six-frites.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
    }
  }
  saveAskCard(blob);
}

export function saveAskCard(blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "six-frites.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
