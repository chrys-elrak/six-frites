import type { Metadata } from "next";
import { linkMetadata } from "@/lib/link-preview";
import { askPreview } from "./share";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { t, profile } = await askPreview(code);
  if (!profile) return { title: "Six Frites" };
  return linkMetadata(t.sendTo(profile.displayName), profile.prompt ?? t.prompt);
}

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
