import { SixApiError } from "@six/sdk";
import { useQuery } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { isErrorWithCode } from "react-native-nitro-google-signin";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { InviteCard, invitePreviewQuery } from "@/components/invites";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/ui";
import { unlock } from "@/lib/app-lock";
import { useT } from "@/lib/i18n";
import { deviceName, GOOGLE_WEB_CLIENT_ID, googleIdToken } from "@/lib/session";
import { six } from "@/lib/six";
import { useTheme } from "@/lib/theme";

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export default function Login() {
  const t = useTheme();
  const tr = useT();
  const { invite, next } = useLocalSearchParams<{ invite?: string; next?: string }>();
  const preview = useQuery({ ...invitePreviewQuery(invite ?? ""), enabled: !!invite });
  const inviteCode = invite && (preview.isPending || preview.data?.status === "valid") ? invite : undefined;
  const [error, setError] = useState<{ text: string; queued: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleIdToken();
      if (!idToken) {
        setError({ text: tr.auth.googleNotFinished, queued: false });
        return;
      }
      unlock();
      await six.auth.loginWithGoogle(idToken, { inviteCode, deviceName: deviceName() });
      if (inviteCode) {
        await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code: inviteCode } } }).catch(() => null);
      }
      if (next?.startsWith("/")) router.replace(next as Href);
    } catch (err) {
      const code = err instanceof SixApiError || isErrorWithCode(err) ? err.code : null;
      const errors: Record<string, string | undefined> = tr.auth.errors;
      setError({
        text: (code && errors[code]) ?? (err instanceof Error ? err.message : tr.common.somethingWrong),
        queued: code === "ACCOUNT_QUEUED",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      {preview.data ? (
        <View style={styles.hero}>
          <InviteCard invite={preview.data} />
          {inviteCode && <Text style={{ color: t.muted, fontSize: 14 }}>{tr.auth.invitedSignIn}</Text>}
        </View>
      ) : (
        <View style={styles.hero}>
          <Logo size={80} />
          <Text style={[styles.title, { color: t.text }]}>Six Frites</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {preview.isError
              ? tr.auth.errors.INVITE_NOT_FOUND
              : next?.startsWith("/add/")
                ? tr.auth.signInToAdd
                : tr.auth.signInToContinue}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        {GOOGLE_WEB_CLIENT_ID ? (
          <Pressable
            onPress={signIn}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.google,
              { borderColor: t.ring, backgroundColor: pressed ? t.pressed : t.surface },
            ]}
          >
            {busy ? <ActivityIndicator color={t.muted} /> : <GoogleMark />}
            <Text style={[styles.googleText, { color: t.text }]}>{tr.auth.continueWithGoogle}</Text>
          </Pressable>
        ) : (
          <Notice tone="error">Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile/.env to enable sign-in.</Notice>
        )}
        {error && <Notice tone={error.queued ? "success" : "error"}>{error.text}</Notice>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 32 },
  hero: { alignItems: "center", gap: 10 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4, marginTop: 4 },
  actions: { gap: 12, width: "100%", maxWidth: 400, alignSelf: "center" },
  google: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  googleText: { fontSize: 15, fontWeight: "600" },
});
