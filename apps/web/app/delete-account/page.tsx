import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { deleteAccount } from "@/lib/legal";

export const metadata: Metadata = { title: "Delete your account · Six Frites" };

export default function DeleteAccountPage() {
  return <LegalPage doc={deleteAccount} />;
}
