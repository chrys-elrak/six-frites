import { unwrap } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { findErrorText, FoundUser } from "@/components/found-user";
import { EmptyState, Loading, PrimaryButton, TextButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

export default function AddScreen() {
  const t = useTheme();
  const tr = useT();
  const { code } = useLocalSearchParams<{ code: string }>();
  const status = useSession((s) => s.status);
  const authed = status === "authed";

  const find = useQuery({
    queryKey: ["find", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/users/find", { params: { query: { q: code } } })),
    enabled: authed,
    retry: false,
  });

  const home = <TextButton title={tr.auth.goHome} onPress={() => router.replace("/")} />;

  if (!authed) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.text, fontSize: 16, textAlign: "center" }}>{tr.auth.signInToAdd}</Text>
        <PrimaryButton
          title={tr.auth.signIn}
          style={{ alignSelf: "stretch" }}
          onPress={() => router.replace({ pathname: "/login", params: { next: `/add/${code}` } })}
        />
      </SafeAreaView>
    );
  }

  if (find.isPending) return <Loading />;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      {find.isError ? (
        <EmptyState Icon={SearchX}>{findErrorText(find.error, tr)}</EmptyState>
      ) : (
        <View style={{ alignSelf: "stretch" }}>
          <FoundUser found={find.data} query={code} />
        </View>
      )}
      {home}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24 },
});
