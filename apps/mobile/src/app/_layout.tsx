import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EmptyState, PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session";
import { brand, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

function Unreachable() {
  const bootstrap = useSession((s) => s.bootstrap);
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.center}>
      <EmptyState Icon={WifiOff} title="Can't reach Six Frites">
        Check your connection and try again.
      </EmptyState>
      <PrimaryButton
        title="Try again"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void bootstrap().finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);
  const authed = status === "authed";

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
    if (status === "anon") client.clear();
  }, [status, client]);

  if (status === "loading") return null;

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: brand, background: t.bg, card: t.bg, text: t.text, border: t.border },
  };

  return (
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
                  <Stack.Protected guard={authed}>
                    <Stack.Screen name="(app)" />
                  </Stack.Protected>
                  <Stack.Protected guard={!authed}>
                    <Stack.Screen name="login" />
                  </Stack.Protected>
                  <Stack.Screen name="invite/[code]" />
                </Stack>
              )}
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
});
