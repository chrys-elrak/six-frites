import { SixApiError, unwrap } from "@six/sdk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { InviteCard, invitePreviewQuery } from "@/components/invites";
import { EmptyState, Loading, Notice, PrimaryButton, TextButton } from "@/components/ui";
import { shareInvite } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

export default function InviteScreen() {
  const t = useTheme();
  const tr = useT();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status, user } = useSession();

  const preview = useQuery(invitePreviewQuery(code));

  const accept = useMutation({
    mutationFn: async () => unwrap(await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code } } })),
  });

  const home = <TextButton title={tr.auth.goHome} onPress={() => router.replace("/")} />;

  if (status !== "authed") return <Redirect href={{ pathname: "/login", params: { invite: code } }} />;
  if (preview.isPending) return <Loading />;

  if (preview.isError) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
        <EmptyState Icon={SearchX} title={tr.auth.inviteNotFound}>
          {tr.auth.inviteNotFoundHint}
        </EmptyState>
        {home}
      </SafeAreaView>
    );
  }

  const isMine = user?.id === preview.data.inviter.id;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <InviteCard invite={preview.data} />

      {preview.data.status === "valid" && (
        <View style={styles.actions}>
          {isMine && (
            <>
              <Text style={{ color: t.muted, textAlign: "center" }}>{tr.auth.yourInvite}</Text>
              <PrimaryButton title={tr.common.shareLink} onPress={() => void shareInvite(preview.data.code)} />
            </>
          )}
          {!isMine && !accept.isSuccess && (
            <PrimaryButton title={tr.auth.acceptInvite} onPress={() => accept.mutate()} disabled={accept.isPending} />
          )}
          {accept.isSuccess && (
            <Notice tone="success">{tr.auth.connectedWith(accept.data.referrer.displayName)}</Notice>
          )}
          {accept.isError && (
            <Notice tone="error">
              {accept.error instanceof SixApiError
                ? ((tr.auth.acceptErrors as Record<string, string | undefined>)[accept.error.code] ??
                  accept.error.message)
                : tr.common.somethingWrong}
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
  actions: { width: "100%", maxWidth: 400, gap: 12 },
});
