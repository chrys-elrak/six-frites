import type { Metadata } from "next";
import { headers } from "next/headers";
import { askPreview } from "./share";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { t, profile } = await askPreview(code);
  if (!profile) return { title: "Six Frites" };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const title = t.sendTo(profile.displayName);
  const description = profile.prompt ?? t.prompt;
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Six Frites" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
