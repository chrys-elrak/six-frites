const MAX_BYTES = 64 * 1024;
const SIZE = 192;

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

function squareJpeg(source: CanvasImageSource, width: number, height: number) {
  const side = Math.min(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (bytesOf(url) <= MAX_BYTES) return url;
  }
  throw new Error("This photo is too detailed to shrink enough. Try another one.");
}

/** Center-crops an image file to a square JPEG data URL small enough to store as a contact photo. */
export async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return squareJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Rasterizes an image URL (such as a generated SVG avatar) the same way as an uploaded photo. */
export async function urlToAvatarDataUrl(src: string): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return squareJpeg(img, img.naturalWidth || SIZE, img.naturalHeight || SIZE);
}
