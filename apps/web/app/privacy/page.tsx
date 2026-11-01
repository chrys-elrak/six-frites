import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · Six Frites" };

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
