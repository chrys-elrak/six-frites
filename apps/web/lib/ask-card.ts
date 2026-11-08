import { type AnonMessageDTO, type AskColors, type EntityType, doodleTileSvg } from "@six/shared";
import { formatDuration } from "./format";
import { getT } from "./i18n";
import { type Segment, segments } from "./markup";
import { isDark } from "./theme";

const W = 1080;
const H = 1920;
const CARD_W = 900;
const PAD = 64;
const HEADER_H = 180;
const MAX_TEXT_H = 900;
const LOGO = 72;
const PHOTO_H = 600;
const VOICE_H = 120;
const FONT = 'ui-sans-serif, system-ui, sans-serif, "Noto Color Emoji", "Apple Color Emoji"';

export interface CardStyle {
  colors: AskColors;
  /** Just the card on a transparent background, to lay over a photo, instead of a whole story. */
  transparent: boolean;
  /** The chat wallpaper's doodles over the story's background. */
  doodles: boolean;
}

const fontFor = (styles: Set<EntityType>, size: number) =>
  styles.has("code")
    ? `600 ${Math.round(size * 0.85)}px ui-monospace, SFMono-Regular, Menlo, monospace`
    : `${styles.has("italic") ? "italic " : ""}${styles.has("bold") ? 900 : 700} ${size}px ${FONT}`;

const measure = (ctx: CanvasRenderingContext2D, run: Segment, size: number) => {
  ctx.font = fontFor(run.styles, size);
  return ctx.measureText(run.text).width;
};

const sameStyles = (a: Set<EntityType>, b: Set<EntityType>) => a.size === b.size && [...a].every((s) => b.has(s));

/**
 * Lays styled text out in lines no wider than `width`, each a list of runs in one style. Lines break between
 * words, and inside a word only when it is too long for a line of its own.
 */
function wrap(ctx: CanvasRenderingContext2D, segs: Segment[], size: number, width: number) {
  const lines: Segment[][] = [[]];
  let used = 0;
  const add = (run: Segment, w: number) => {
    const line = lines[lines.length - 1]!;
    const last = line[line.length - 1];
    if (last && sameStyles(last.styles, run.styles)) last.text += run.text;
    else line.push({ ...run });
    used += w;
  };
  const newLine = () => {
    lines.push([]);
    used = 0;
  };
  for (const seg of segs) {
    for (const piece of seg.text.split(/(\n|[^\S\n]+)/)) {
      if (!piece) continue;
      if (piece === "\n") {
        newLine();
        continue;
      }
      const run = { ...seg, text: piece };
      const w = measure(ctx, run, size);
      if (!piece.trim()) {
        if (used) add(run, w);
      } else if (used + w <= width) {
        add(run, w);
      } else if (w <= width) {
        newLine();
        add(run, w);
      } else {
        for (const ch of Array.from(piece)) {
          const c = { ...seg, text: ch };
          const cw = measure(ctx, c, size);
          if (used && used + cw > width) newLine();
          add(c, cw);
        }
      }
    }
  }
  for (const line of lines) {
    const last = line[line.length - 1];
    if (last) last.text = last.text.trimEnd();
    if (last && !last.text) line.pop();
  }
  return lines;
}

/** Covers a spoiler with dots, as the app shows one before it's tapped; its text is never drawn, so the image can't give it away. */
function drawSpoiler(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, ink: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, h * 0.2);
  ctx.clip();
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(x, top, w, h);
  ctx.globalAlpha = 0.75;
  for (let n = Math.ceil((w * h) / 50); n > 0; n--) {
    ctx.beginPath();
    ctx.arc(x + Math.random() * w, top + Math.random() * h, 1 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A voice message as the app shows one, with a play button, its waveform and how long it lasts. */
function drawVoice(
  ctx: CanvasRenderingContext2D,
  { durationMs, waveform }: NonNullable<AnonMessageDTO["voice"]>,
  left: number,
  top: number,
  w: number,
  colors: AskColors,
  dark: boolean,
) {
  const h = VOICE_H;
  const mid = top + h / 2;
  ctx.fillStyle = dark ? "#292524" : "#f5f5f4";
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fill();

  const r = h * 0.34;
  const cx = left + h / 2;
  ctx.fillStyle = gradient(ctx, colors, cx - r, mid - r, r * 2, r * 2);
  ctx.beginPath();
  ctx.arc(cx, mid, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.3, mid - r * 0.45);
  ctx.lineTo(cx + r * 0.5, mid);
  ctx.lineTo(cx - r * 0.3, mid + r * 0.45);
  ctx.closePath();
  ctx.fill();

  const label = formatDuration(durationMs);
  ctx.font = `600 36px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillStyle = dark ? "#a8a29e" : "#78716c";
  ctx.fillText(label, left + w - h * 0.4, mid);
  const barsLeft = left + h;
  const barsRight = left + w - h * 0.4 - ctx.measureText(label).width - 32;
  const bars = waveform.length ? waveform : Array<number>(48).fill(30);
  const step = (barsRight - barsLeft) / bars.length;
  ctx.fillStyle = dark ? "rgba(250,250,249,0.55)" : "rgba(28,25,23,0.45)";
  bars.forEach((v, i) => {
    const bh = Math.max(8, (v / 100) * h * 0.56);
    ctx.beginPath();
    ctx.roundRect(barsLeft + i * step + step * 0.2, mid - bh / 2, step * 0.6, bh, step * 0.3);
    ctx.fill();
  });
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

/** A tile of the chat wallpaper's doodles to fill with; null if the browser can't load it. */
const loadDoodles = (ink: string, opacity: number, size: number) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml,${encodeURIComponent(doodleTileSvg(ink, opacity, size))}`;
  });

const gradient = (ctx: CanvasRenderingContext2D, [from, to]: AskColors, x: number, y: number, w: number, h: number) => {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
};

/** Fetches the message's photo as a bitmap; fetched rather than drawn from an <img> so the canvas can still be saved. */
const loadPhoto = async (url: string) => createImageBitmap(await (await fetch(url)).blob());

/** The first frame of a GIF's MP4, from a fetched copy for the same reason; null if the browser can't decode it. */
async function loadFrame(url: string) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(await (await fetch(url)).blob());
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
    });
    return await createImageBitmap(video);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

/**
 * Draws an anonymous message as a PNG: the question, and its photo or its GIF's first frame if any, on a
 * card with a doodled header, light or dark as the system is, either alone on a transparent background or
 * on a story-sized page with the link to send more under it.
 */
export async function askCardPng(
  { text, prompt: asked, entities, photoUrl, gif, voice }: Pick<AnonMessageDTO, "text" | "prompt" | "entities" | "photoUrl" | "gif" | "voice">,
  link: string,
  { colors, transparent, doodles }: CardStyle,
) {
  const [icon, photo, headDoodles, pageDoodles] = await Promise.all([
    loadLogo(),
    photoUrl ? loadPhoto(photoUrl) : gif ? loadFrame(gif.url) : null,
    loadDoodles("#ffffff", 0.3, 400),
    !transparent && doodles ? loadDoodles(colors[1], 0.22, 720) : null,
    document.fonts.ready,
  ]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const dark = isDark();
  const photoH = photo ? PHOTO_H : 0;
  const voiceH = voice ? PAD + VOICE_H : 0;
  const textRoom = MAX_TEXT_H - photoH - voiceH;

  const segs = segments(text, entities);
  let size = 84;
  let lines: Segment[][] = [];
  do {
    size -= 4;
    lines = text ? wrap(ctx, segs, size, CARD_W - PAD * 2) : [];
  } while (lines.length * size * 1.25 > textRoom && size > 32);
  const lineH = size * 1.25;
  lines = lines.slice(0, Math.floor(textRoom / lineH));

  const cardH = HEADER_H + photoH + voiceH + (lines.length ? PAD * 2 + lines.length * lineH : voice ? PAD : 0);
  canvas.width = transparent ? CARD_W : W;
  canvas.height = transparent ? cardH : H;
  const x = transparent ? 0 : (W - CARD_W) / 2;
  const y = transparent ? 0 : (H - cardH) / 2 - 80;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!transparent) {
    ctx.fillStyle = gradient(ctx, colors, 0, 0, W, H);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillRect(0, 0, W, H);
    if (pageDoodles) {
      ctx.fillStyle = ctx.createPattern(pageDoodles, "repeat")!;
      ctx.fillRect(0, 0, W, H);
    }
  }

  ctx.save();
  if (!transparent) {
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, CARD_W, cardH, 48);
  ctx.fillStyle = dark ? "#1c1917" : "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, CARD_W, cardH, 48);
  ctx.clip();
  ctx.fillStyle = gradient(ctx, colors, x, y, CARD_W, HEADER_H);
  ctx.fillRect(x, y, CARD_W, HEADER_H);
  if (headDoodles) {
    ctx.fillStyle = ctx.createPattern(headDoodles, "repeat")!;
    ctx.fillRect(x, y, CARD_W, HEADER_H);
  }
  if (photo) {
    const scale = Math.max(CARD_W / photo.width, PHOTO_H / photo.height);
    const [sw, sh] = [CARD_W / scale, PHOTO_H / scale];
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, x, y + HEADER_H, CARD_W, PHOTO_H);
    photo.close();
  }
  ctx.restore();

  const mid = x + CARD_W / 2;
  const headMid = y + HEADER_H / 2;
  const prompt = asked ?? getT().ask.prompt;
  ctx.font = `700 46px ${FONT}`;
  const room = CARD_W - PAD * 2 - (icon ? LOGO + 20 : 0);
  const promptW = Math.min(ctx.measureText(prompt).width, room);
  const start = mid - (promptW + (icon ? LOGO + 20 : 0)) / 2;
  if (icon) ctx.drawImage(icon, start, headMid - LOGO / 2, LOGO, LOGO);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(prompt, start + (icon ? LOGO + 20 : 0), headMid, room);
  ctx.textAlign = "center";

  const ink = dark ? "#fafaf9" : "#1c1917";
  if (voice) drawVoice(ctx, voice, x + PAD, y + HEADER_H + photoH + PAD, CARD_W - PAD * 2, colors, dark);
  ctx.textAlign = "left";
  lines.forEach((line, i) => {
    const widths = line.map((run) => measure(ctx, run, size));
    let left = mid - widths.reduce((a, b) => a + b, 0) / 2;
    const cy = y + HEADER_H + photoH + voiceH + PAD + lineH * (i + 0.5);
    line.forEach((run, k) => {
      const w = widths[k]!;
      if (run.styles.has("spoiler")) {
        drawSpoiler(ctx, left, cy - size * 0.55, w, size * 1.1, ink);
      } else {
        if (run.styles.has("code")) {
          ctx.fillStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
          ctx.beginPath();
          ctx.roundRect(left, cy - size * 0.6, w, size * 1.2, size * 0.2);
          ctx.fill();
        }
        ctx.font = fontFor(run.styles, size);
        ctx.fillStyle = ink;
        ctx.fillText(run.text, left, cy);
        if (run.styles.has("strike")) ctx.fillRect(left, cy - size * 0.04, w, Math.max(2, size / 14));
      }
      left += w;
    });
  });
  ctx.textAlign = "center";

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
