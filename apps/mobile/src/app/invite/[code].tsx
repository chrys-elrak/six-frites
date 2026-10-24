import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { EmptyState, Loading, Notice, PrimaryButton, TextButton } from "@/components/ui";
import { shareInvite } from "@/lib/format";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

const acceptErrors: Record<string, string> = {
  ALREADY_REFERRED: "You've already joined through an invite.",
  INVITE_OWN: "This is your own invite.",
  INVITE_EXPIRED: "This invite has expired.",
  INVITE_EXHAUSTED: "This invite has already been used up.",
};

export default function InviteScreen() {
  const t = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status, user } = useSession();

  const preview = useQuery({
    queryKey: ["invite", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/invites/{code}", { params: { path: { code } } })),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code } } })),
  });

  const home = <TextButton title="Go to Six Frites" onPress={() => router.replace("/")} />;

  if (preview.isPending) return <Loading />;

  if (preview.isError) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
        <EmptyState Icon={SearchX} title="This invite doesn't exist">
          Check the link, or ask your friend for a new one.
        </EmptyState>
        {home}
      </SafeAreaView>
    );
  }

  const { inviter, status: inviteStatus } = preview.data;
  const isMine = user?.id === inviter.id;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <Avatar user={inviter} size="lg" />
      <View style={{ gap: 4 }}>
        <Text style={[styles.title, { color: t.text }]}>{inviter.displayName} invited you to Six Frites</Text>
        {inviteStatus !== "valid" && (
          <Text style={{ color: t.danger, textAlign: "center" }}>
            {inviteStatus === "expired" ? "This invite has expired." : "This invite has already been used up."}
          </Text>
        )}
      </View>

      {inviteStatus === "valid" && (
        <View style={styles.actions}>
          {status !== "authed" && (
            <PrimaryButton
              title="Sign in to accept"
              onPress={() => router.replace({ pathname: "/login", params: { invite: preview.data.code } })}
            />
          )}
          {status === "authed" && isMine && (
            <>
              <Text style={{ color: t.muted, textAlign: "center" }}>
                This is your invite link. Share it with a friend.
              </Text>
              <PrimaryButton title="Share link" onPress={() => void shareInvite(preview.data.code)} />
            </>
          )}
          {status === "authed" && !isMine && !accept.isSuccess && (
            <PrimaryButton title="Accept invite" onPress={() => accept.mutate()} disabled={accept.isPending} />
          )}
          {accept.isSuccess && <Notice tone="success">You're connected with {accept.data.referrer.displayName}.</Notice>}
          {accept.isError && (
            <Notice tone="error">
              {accept.error instanceof SixApiError
                ? (acceptErrors[accept.error.code] ?? accept.error.message)
                : "Something went wrong."}
            </Notice>
          )}
        </View>
      )}
      {home}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24, paddingHorizontal: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  actions: { width: "100%", maxWidth: 400, gap: 12 },
});
