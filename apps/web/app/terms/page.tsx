import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { terms } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service · Six Frites" };

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
