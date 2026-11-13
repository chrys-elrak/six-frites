import "@/lib/polyfills";
import { isLimited } from "@six/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { usePreventScreenCapture } from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TermsGate } from "@/components/terms-gate";
import { LocaleSync } from "@/lib/locale-sync";
import { EmptyState, PrimaryButton } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { brand, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

function Unreachable() {
  const tr = useT();
  const bootstrap = useSession((s) => s.bootstrap);
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.center}>
      <EmptyState Icon={WifiOff} title={tr.common.unreachable}>
        {tr.common.checkConnection}
      </EmptyState>
      <PrimaryButton
        title={tr.common.retry}
        busy={busy}
        onPress={() => {
          setBusy(true);
          void bootstrap().finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

const preventScreenCapture = process.env.EXPO_PUBLIC_ALLOW_SCREEN_CAPTURE ? () => {} : usePreventScreenCapture;

export default function RootLayout() {
  preventScreenCapture();
  const t = useTheme();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);
  const authed = status === "authed";
  const guest = useSession((s) => !!s.user && isLimited(s.user));
  const localeReady = useLocale((s) => s.ready);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status !== "loading" && localeReady) void SplashScreen.hideAsync();
    if (status === "anon") client.clear();
  }, [status, localeReady, client]);

  if (status === "loading" || !localeReady) return null;

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: brand, background: t.bg, card: t.bg, text: t.text, border: t.border },
  };

  return (
    <ShareIntentProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <QueryClientProvider client={client}>
              <ThemeProvider value={navTheme}>
                <StatusBar style={t.dark ? "light" : "dark"} />
                {status === "unreachable" ? (
                  <Unreachable />
                ) : (
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                    <Stack.Protected guard={authed && !guest}>
                      <Stack.Screen name="(app)" />
                    </Stack.Protected>
                    <Stack.Protected guard={authed && guest}>
                      <Stack.Screen name="guest" />
                    </Stack.Protected>
                    <Stack.Protected guard={!authed}>
                      <Stack.Screen name="login" />
                    </Stack.Protected>
                    <Stack.Screen name="invite/[code]" />
                    <Stack.Screen name="add/[code]" />
                    <Stack.Screen name="g/[code]" />
                  </Stack>
                )}
                <TermsGate />
                <LocaleSync />
              </ThemeProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
});
