import { LOCALE_COOKIE, pickLocale } from "@six/shared";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { SITE_URL } from "@/lib/site";
import { BAR_COLORS, readTheme } from "@/lib/theme";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Six Frites",
  description: "Chat with the people who matter.",
  appleWebApp: { title: "Six Frites", statusBarStyle: "default" },
  openGraph: { type: "website", siteName: "Six Frites", title: "Six Frites", description: "Chat with the people who matter." },
  twitter: { card: "summary_large_image" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = readTheme((await cookies()).get("theme")?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "resizes-content",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: BAR_COLORS[theme === "system" ? "light" : theme] },
      { media: "(prefers-color-scheme: dark)", color: BAR_COLORS[theme === "system" ? "dark" : theme] },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const accepted = (await headers()).get("accept-language")?.split(",").map((tag) => tag.split(";")[0]!.trim()) ?? [];
  const jar = await cookies();
  const locale = pickLocale([jar.get(LOCALE_COOKIE)?.value, ...accepted]);
  const theme = readTheme(jar.get("theme")?.value);
  return (
    <html
      suppressHydrationWarning
      lang={locale}
      data-font={jar.get("font")?.value === "plain" ? "plain" : undefined}
      data-theme={theme === "system" ? undefined : theme}
    >
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
