import { randomAlias } from "@six/shared";
import { unwrap } from "@six/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Users } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "@/components/avatar";
import { NicknameFields, groupError } from "@/components/groups";
import { Text } from "@/components/text";
import { EmptyState, Loading, PrimaryButton, TextButton } from "@/components/ui";
import { joinGroup } from "@/lib/groups";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

export default function JoinGroupScreen() {
  const t = useTheme();
  const tr = useT();
  const qc = useQueryClient();
  const { code } = useLocalSearchParams<{ code: string }>();
  const authed = useSession((s) => s.status) === "authed";
  const preview = useQuery({
    queryKey: ["group-preview", code],
    queryFn: async () => unwrap(await six.api.GET("/v1/groups/join/{code}", { params: { path: { code } } })),
    enabled: authed,
    retry: false,
  });
  const [nickname, setNickname] = useState(randomAlias);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const chat = await joinGroup(qc, code, { nickname: nickname.trim(), ...(photo && { photo }) });
      router.replace(`/chats/${chat.id}`);
    } catch (err) {
      setError(groupError(err, tr));
      setJoining(false);
    }
  }

  if (!authed) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.text, fontSize: 16, textAlign: "center" }}>{tr.groups.join}</Text>
        <PrimaryButton
          title={tr.auth.signIn}
          style={{ alignSelf: "stretch" }}
          onPress={() => router.replace({ pathname: "/login", params: { next: `/g/${code}` } })}
        />
      </SafeAreaView>
    );
  }
  if (preview.isPending) return <Loading />;

  const g = preview.data;
  const home = <TextButton title={tr.auth.goHome} onPress={() => router.replace("/")} />;
  if (!g) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.bg }]}>
        <EmptyState Icon={Users}>{groupError(preview.error, tr)}</EmptyState>
        {home}
      </SafeAreaView>
    );
  }

  const closed = !g.chatId && (g.banned || g.full);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: 6 }}>
            <Avatar user={{ displayName: g.title, avatarUrl: g.photoUrl }} size="xl" />
            <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>{g.title}</Text>
            <Text style={{ color: t.muted }}>{tr.groups.membersOf(g.memberCount, g.maxMembers)}</Text>
            {g.description && <Text style={{ color: t.text, textAlign: "center" }}>{g.description}</Text>}
          </View>
          {g.chatId ? (
            <PrimaryButton title={tr.groups.open} onPress={() => router.replace(`/chats/${g.chatId}`)} />
          ) : closed ? (
            <Text style={{ color: t.muted, textAlign: "center" }}>{g.banned ? tr.groups.banned : tr.groups.full}</Text>
          ) : (
            <>
              <NicknameFields nickname={nickname} photo={photo} onNickname={setNickname} onPhoto={setPhoto} />
              {error && <Text style={{ color: t.danger }}>{error}</Text>}
              <PrimaryButton title={tr.groups.join} busy={joining} disabled={joining || !nickname.trim()} onPress={() => void join()} />
            </>
          )}
          {home}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24 },
  body: { flexGrow: 1, justifyContent: "center", gap: 20, padding: 24 },
});
