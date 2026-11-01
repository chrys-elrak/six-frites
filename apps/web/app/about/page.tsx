import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { about } from "@/lib/legal";

export const metadata: Metadata = { title: "About · Six Frites" };

export default function AboutPage() {
  return <LegalPage doc={about} />;
}
