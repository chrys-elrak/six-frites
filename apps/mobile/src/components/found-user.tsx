import { SixApiError, unwrap } from "@six/sdk";
import type { FoundUserDTO } from "@six/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./avatar";
import { PrimaryButton } from "./ui";

export const findErrors: Record<string, string> = {
  USER_NOT_FOUND: "No one matches that code, username or email.",
  CONTACT_SELF: "That's you.",
  RATE_LIMITED: "Too many searches. Wait a minute and try again.",
};

export const findErrorText = (err: unknown) =>
  err instanceof SixApiError ? (findErrors[err.code] ?? err.message) : "Something went wrong.";

export function FoundUser({ found, query, onAdded }: { found: FoundUserDTO; query: string; onAdded?: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/contacts", { body: { q: query } })),
    onSuccess: (contact) => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
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
        title={found.chatId ? "Open chat" : "Message"}
        onPress={() => add.mutate()}
        disabled={add.isPending}
        busy={add.isPending}
        style={{ alignSelf: "stretch" }}
      />
      {add.isError && <Text style={{ color: t.danger, fontSize: 14 }}>{findErrorText(add.error)}</Text>}
    </View>
  );
}
