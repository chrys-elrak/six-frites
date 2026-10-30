import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Hands an attachment to the system share sheet (save, open with…), downloading it to the cache first unless it's
 * already on the phone, like a decrypted one.
 */
export async function shareRemoteFile(url: string, name: string, mime?: string) {
  const safe = name.replace(/[^\w.\- ]+/g, "_") || "file";
  const uri = url.startsWith("file:")
    ? url
    : (await File.downloadFileAsync(url, new File(Paths.cache, `${Date.now()}-${safe}`))).uri;
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: name });
}
