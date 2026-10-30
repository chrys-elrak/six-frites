import { type Hydrated, kindFor } from "@six/sdk";
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  type PhotoEdit,
  cropPixels,
  orientedSize,
  stripAudio,
  trimVideo,
  videoCuts,
} from "@six/shared";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, type ImageRef, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { ReceivedImage } from "../../modules/rich-input";
import { getT } from "./i18n";
import type { LocalFile } from "./send";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  pdf: "application/pdf",
};

const nameFromUri = (uri: string) => decodeURIComponent(uri.split("/").pop()?.split("?")[0] ?? "file");

function guessMime(name: string, given?: string | null) {
  if (given && given !== "application/octet-stream") return given;
  return EXT_MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

async function saveImage(file: LocalFile, rendered: ImageRef, format = SaveFormat.JPEG): Promise<LocalFile> {
  const saved = await rendered.saveAsync({ format, compress: 0.9 });
  const size = (await (await fetch(saved.uri)).blob()).size;
  return {
    ...file,
    uri: saved.uri,
    kind: "image",
    mime: `image/${format}`,
    name: file.name.replace(/\.\w+$/, "") + (format === SaveFormat.JPEG ? ".jpg" : `.${format}`),
    size,
    width: saved.width,
    height: saved.height,
  };
}

/** Re-encodes photos the API can't take as images (such as HEIC) to JPEG so they still arrive as photos. */
async function asSendableImage(file: LocalFile): Promise<LocalFile> {
  if (!file.mime.startsWith("image/") || ACCEPTED_TYPES.image.includes(file.mime)) return file;
  return saveImage(file, await ImageManipulator.manipulate(file.uri).renderAsync());
}

const formatFor = (file: LocalFile) =>
  file.mime === "image/png" ? SaveFormat.PNG : file.mime === "image/webp" ? SaveFormat.WEBP : SaveFormat.JPEG;

/** Turns, mirrors and crops a width × height photo at full size, for edits with nothing drawn on them. */
export async function editPhoto(file: LocalFile, edit: PhotoEdit, width: number, height: number) {
  const oriented = orientedSize(width, height, edit.turns);
  let context = ImageManipulator.manipulate(file.uri).rotate(-90 * edit.turns);
  if (edit.flipped) context = context.flip("horizontal");
  const rendered = await context.crop(cropPixels(edit.crop, oriented.width, oriented.height)).renderAsync();
  return saveImage(file, rendered, formatFor(file));
}

/** Saves a drawn-on photo the editor exported as base64 PNG. */
export async function editedFromPng(file: LocalFile, base64: string) {
  const png = new File(Paths.cache, `edited-${randomUUID()}.png`);
  png.create();
  await png.write(base64, { encoding: "base64" });
  const photo = await saveImage(file, await ImageManipulator.manipulate(png.uri).renderAsync(), formatFor(file));
  png.delete();
  return photo;
}

/** The file a message carries, on this phone, downloading it first when it isn't here yet. */
export async function messageFile(m: Hydrated): Promise<LocalFile> {
  const a = m.attachment!;
  if (!a.url) throw new Error("The file is not ready");
  const uri = a.url.startsWith("file:")
    ? a.url
    : (await File.downloadFileAsync(a.url, new File(Paths.cache, `file-${randomUUID()}-${a.name.replace(/[^\w.-]+/g, "_")}`))).uri;
  return {
    uri,
    kind: a.kind,
    name: a.name,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    sticker: m.file?.sticker,
  };
}

/** A copy of the video with its sound taken out, or null when it isn't an MP4 or MOV that can be edited. */
export async function muteVideo(file: LocalFile): Promise<LocalFile | null> {
  const bytes = await new File(file.uri).bytes();
  if (!stripAudio(bytes)) return null;
  const out = new File(Paths.cache, `muted-${randomUUID()}.${file.name.split(".").pop()}`);
  out.create();
  await out.write(bytes);
  return { ...file, uri: out.uri };
}

/** The video's length and the keyframes a cut can start on, or null when it can't be cut. */
export async function readVideoCuts(file: LocalFile) {
  return videoCuts(await new File(file.uri).bytes());
}

/** A copy of the video cut to `from`–`to` seconds (from snaps back to a keyframe), or null when it can't be cut. */
export async function cutVideo(file: LocalFile, from: number, to: number): Promise<LocalFile | null> {
  const bytes = trimVideo(await new File(file.uri).bytes(), from, to);
  if (!bytes) return null;
  const out = new File(Paths.cache, `cut-${randomUUID()}.${file.name.split(".").pop()}`);
  out.create();
  await out.write(bytes);
  const duration = videoCuts(bytes)?.duration;
  return { ...file, uri: out.uri, size: bytes.length, durationMs: duration ? Math.round(duration * 1000) : file.durationMs };
}

async function fromPickerAsset(a: ImagePicker.ImagePickerAsset): Promise<LocalFile> {
  const name = a.fileName ?? nameFromUri(a.uri);
  const mime = guessMime(name, a.mimeType);
  const size = a.fileSize ?? (await (await fetch(a.uri)).blob()).size;
  return asSendableImage({
    uri: a.uri,
    name,
    mime,
    kind: a.type === "video" ? "video" : kindFor(mime),
    size,
    width: a.width || null,
    height: a.height || null,
    durationMs: a.duration ?? null,
  });
}

export class TooLargeError extends Error {
  constructor(public readonly names: string[]) {
    super(getT().composer.tooLarge(names));
  }
}

function checkSizes(files: LocalFile[]) {
  const big = files.filter((f) => f.size > MAX_UPLOAD_BYTES).map((f) => f.name);
  if (big.length) throw new TooLargeError(big);
  return files;
}

export async function pickMedia(): Promise<LocalFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 1,
  });
  if (res.canceled) return [];
  return checkSizes(await Promise.all(res.assets.map(fromPickerAsset)));
}

export async function takePhoto(): Promise<LocalFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error(getT().composer.cameraDenied);
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
  if (res.canceled) return [];
  return checkSizes(await Promise.all(res.assets.map(fromPickerAsset)));
}

export async function pickFiles(type = "*/*"): Promise<LocalFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type, multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return checkSizes(
    res.assets.map((a) => {
      const mime = guessMime(a.name, a.mimeType);
      return { uri: a.uri, name: a.name, mime, kind: kindFor(mime), size: a.size ?? 0 };
    }),
  );
}

/** A picture the keyboard inserted or the user pasted, ready to send as a photo. */
export async function receivedImage(image: ReceivedImage): Promise<LocalFile> {
  const file = await asSendableImage({
    uri: image.uri,
    name: nameFromUri(image.uri),
    mime: image.mime,
    kind: "image",
    size: image.size,
    width: image.width || null,
    height: image.height || null,
  });
  return checkSizes([file])[0]!;
}

const MAX_AVATAR_BYTES = 64 * 1024;
const AVATAR_SIZE = 192;

/** Center-crops an image to a square JPEG data URL small enough to store as a contact photo. */
export async function toAvatarDataUrl(uri: string, width: number, height: number): Promise<string> {
  const side = Math.min(width, height);
  const rendered = await ImageManipulator.manipulate(uri)
    .crop({ originX: (width - side) / 2, originY: (height - side) / 2, width: side, height: side })
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE })
    .renderAsync();
  for (const compress of [0.85, 0.7, 0.55, 0.4]) {
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (out.base64 && Math.floor((out.base64.length * 3) / 4) <= MAX_AVATAR_BYTES) {
      return `data:image/jpeg;base64,${out.base64}`;
    }
  }
  throw new Error(getT().composer.photoTooDetailed);
}

export async function pickAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const a = res.canceled ? undefined : res.assets[0];
  return a ? toAvatarDataUrl(a.uri, a.width, a.height) : null;
}
