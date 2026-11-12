import { SixApiError } from "@six/sdk";
import { signInMessage } from "@six/shared";
import { useQuery } from "@tanstack/react-query";
import * as AppleAuthentication from "expo-apple-authentication";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { isErrorWithCode } from "react-native-nitro-google-signin";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { InviteCard, invitePreviewQuery } from "@/components/invites";
import { LegalLinks } from "@/components/settings-panel";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/ui";
import { unlock } from "@/lib/app-lock";
import { getLocale, useT } from "@/lib/i18n";
import { deviceId, deviceName, GOOGLE_WEB_CLIENT_ID, googleIdToken } from "@/lib/session";
import { type SocialProvider, SocialSignInError, socialIdToken } from "@/lib/social-sign-in";
import { six, WEB_URL } from "@/lib/six";
import { brand, stone, useTheme } from "@/lib/theme";

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

const MARKS: Record<SocialProvider, string> = {
  apple:
    "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
};

export default function Login() {
  const t = useTheme();
  const tr = useT();
  const { invite, next } = useLocalSearchParams<{ invite?: string; next?: string }>();
  const preview = useQuery({ ...invitePreviewQuery(invite ?? ""), enabled: !!invite });
  const inviteCode = invite && (preview.isPending || preview.data?.status === "valid") ? invite : undefined;
  const [error, setError] = useState<{ text: string; queued: boolean } | null>(null);
  const [busy, setBusy] = useState<"google" | SocialProvider | null>(null);

  async function signIn(via: "google" | SocialProvider) {
    setBusy(via);
    setError(null);
    try {
      const idToken = via === "google" ? await googleIdToken() : await socialIdToken(via);
      if (!idToken) {
        if (via === "google") setError({ text: tr.auth.googleNotFinished, queued: false });
        return;
      }
      unlock();
      const extra = { inviteCode, guest: true, deviceName: deviceName(), deviceId: await deviceId() };
      await (via === "google" ? six.auth.loginWithGoogle(idToken, extra) : six.auth.loginWithFirebase(idToken, extra));
      const accepted = inviteCode
        ? await six.api.POST("/v1/invites/{code}/accept", { params: { path: { code: inviteCode } } }).catch(() => null)
        : null;
      if (accepted?.data?.chatId) router.replace(`/chats/${accepted.data.chatId}`);
      else if (next?.startsWith("/")) router.replace(next as Href);
    } catch (err) {
      const code = err instanceof SixApiError || err instanceof SocialSignInError || isErrorWithCode(err) ? err.code : null;
      const known = code && signInMessage(getLocale(), code, err instanceof SixApiError ? err.details : undefined);
      setError({
        text: known || (err instanceof Error ? err.message : tr.common.somethingWrong),
        queued: code === "ACCOUNT_QUEUED",
      });
    } finally {
      setBusy(null);
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
            onPress={() => void signIn("google")}
            disabled={!!busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.google,
              { borderColor: t.ring, backgroundColor: pressed ? t.pressed : t.surface },
            ]}
          >
            {busy === "google" ? <ActivityIndicator color={t.muted} /> : <GoogleMark />}
            <Text style={[styles.googleText, { color: t.text }]}>{tr.auth.continueWithGoogle}</Text>
          </Pressable>
        ) : (
          <Notice tone="error">Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in apps/mobile/.env to enable sign-in.</Notice>
        )}
        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              t.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={24}
            style={styles.provider}
            onPress={() => void (busy || signIn("apple"))}
          />
        ) : (
          <ProviderButton provider="apple" busy={busy === "apple"} disabled={!!busy} onPress={() => void signIn("apple")} />
        )}
        <ProviderButton provider="facebook" busy={busy === "facebook"} disabled={!!busy} onPress={() => void signIn("facebook")} />
        <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{tr.auth.appleShareEmail}</Text>
        {error && <Notice tone={error.queued ? "success" : "error"}>{error.text}</Notice>}
        <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/support`)} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.support}>{tr.support.chatWithSupport}</Text>
        </Pressable>
        <LegalLinks />
      </View>
    </SafeAreaView>
  );
}

function ProviderButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: SocialProvider;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const tr = useT();
  const bg = provider === "apple" ? "#000" : "#1877F2";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.provider,
        styles.google,
        { backgroundColor: bg, borderColor: provider === "apple" && t.dark ? stone[600] : bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path fill="#fff" d={MARKS[provider]} />
        </Svg>
      )}
      <Text style={[styles.googleText, { color: "#fff" }]}>
        {provider === "apple" ? tr.auth.continueWithApple : tr.auth.continueWithFacebook}
      </Text>
    </Pressable>
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
  provider: { height: 48, width: "100%" },
  support: { color: brand, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
