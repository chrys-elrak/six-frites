import { kindFor } from "@six/sdk";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@six/shared";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
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

/** Re-encodes photos the API can't take as images (such as HEIC) to JPEG so they still arrive as photos. */
async function asSendableImage(file: LocalFile): Promise<LocalFile> {
  if (!file.mime.startsWith("image/") || ACCEPTED_TYPES.image.includes(file.mime)) return file;
  const rendered = await ImageManipulator.manipulate(file.uri).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const size = (await (await fetch(saved.uri)).blob()).size;
  return {
    ...file,
    uri: saved.uri,
    kind: "image",
    mime: "image/jpeg",
    name: file.name.replace(/\.\w+$/, "") + ".jpg",
    size,
    width: saved.width,
    height: saved.height,
  };
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
    super(`${names.join(", ")} ${names.length === 1 ? "is" : "are"} larger than 25 MB.`);
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
  if (!perm.granted) throw new Error("Camera access was denied.");
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 });
  if (res.canceled) return [];
  return checkSizes(await Promise.all(res.assets.map(fromPickerAsset)));
}

export async function pickFiles(): Promise<LocalFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return checkSizes(
    res.assets.map((a) => {
      const mime = guessMime(a.name, a.mimeType);
      return { uri: a.uri, name: a.name, mime, kind: kindFor(mime), size: a.size ?? 0 };
    }),
  );
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
  throw new Error("This photo is too detailed to shrink enough. Try another one.");
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
