import { SixApiError, unwrap } from "@six/sdk";
import type { Dict, FoundUserDTO } from "@six/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useT } from "@/lib/i18n";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";

export const findErrorText = (err: unknown, tr: Dict) =>
  err instanceof SixApiError
    ? ((tr.contacts.findErrors as Record<string, string | undefined>)[err.code] ?? err.message)
    : tr.common.somethingWrong;

export function FoundUser({ found, query, onAdded }: { found: FoundUserDTO; query: string; onAdded?: () => void }) {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/contacts", { body: { q: query } })),
    onSuccess: (contact) => {
      onAdded?.();
      router.push(`/chats/${contact.chatId}`);
    },
  });

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Avatar user={found.user} size="lg" />
      <View style={{ alignItems: "center" }}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{found.user.displayName}</Text>
        {found.username && <Text style={{ color: t.muted, fontSize: 14 }}>@{found.username}</Text>}
      </View>
      <PrimaryButton
        title={found.chatId ? tr.contacts.openChat : tr.common.message}
        onPress={() => add.mutate()}
        disabled={add.isPending}
        busy={add.isPending}
        style={{ alignSelf: "stretch" }}
      />
      {add.isError && <Text style={{ color: t.danger, fontSize: 14 }}>{findErrorText(add.error, tr)}</Text>}
    </View>
  );
}
