import { linkMetadata, linkPreview } from "@/lib/link-preview";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { title, description } = await linkPreview("invite", (await params).code);
  return linkMetadata(title, description);
}

export default function InviteLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
