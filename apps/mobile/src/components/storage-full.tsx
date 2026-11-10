import { unwrap } from "@six/sdk";
import { router } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";
import { getT } from "@/lib/i18n";
import { six, useStorageFull } from "@/lib/six";

const run = async (action: () => Promise<void>) => {
  try {
    await action();
  } catch (err) {
    Alert.alert(getT().messages.storageFull, (err as Error).message);
  }
};

export function StorageFullPrompt() {
  const open = useStorageFull((s) => s.open);

  useEffect(() => {
    if (!open) return;
    useStorageFull.setState({ open: false });
    const tr = getT();
    const deleteAll = () =>
      Alert.alert(tr.messages.deleteMyFiles, tr.messages.deleteMyFilesConfirm, [
        { text: tr.common.cancel, style: "cancel" },
        {
          text: tr.messages.deleteMyFiles,
          style: "destructive",
          onPress: () => void run(async () => void unwrap(await six.api.DELETE("/v1/me/uploads"))),
        },
      ]);
    Alert.alert(tr.messages.storageFull, tr.messages.storageFullBody, [
      { text: tr.messages.deleteMyFiles, style: "destructive", onPress: deleteAll },
      { text: tr.common.cancel, style: "cancel" },
      {
        text: tr.support.contact,
        onPress: () => void run(async () => router.push(`/chats/${unwrap(await six.api.POST("/v1/support")).id}`)),
      },
    ]);
  }, [open]);

  return null;
}
