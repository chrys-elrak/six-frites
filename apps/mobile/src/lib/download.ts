import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Downloads a signed attachment URL to the cache and hands it to the system share sheet (save, open with…). */
export async function shareRemoteFile(url: string, name: string, mime?: string) {
  const safe = name.replace(/[^\w.\- ]+/g, "_") || "file";
  const dest = new File(Paths.cache, `${Date.now()}-${safe}`);
  const file = await File.downloadFileAsync(url, dest);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}
