import { LOCALE_COOKIE, pickLocale } from "@six/shared";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Six Frites",
  description: "Chat with the people who matter.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const accepted = (await headers()).get("accept-language")?.split(",").map((tag) => tag.split(";")[0]!.trim()) ?? [];
  const locale = pickLocale([(await cookies()).get(LOCALE_COOKIE)?.value, ...accepted]);
  return (
    <html lang={locale}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
