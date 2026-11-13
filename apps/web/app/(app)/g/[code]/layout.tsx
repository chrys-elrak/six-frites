import { linkMetadata, linkPreview } from "@/lib/link-preview";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { title, description } = await linkPreview("group", (await params).code);
  return linkMetadata(title, description);
}

export default function GroupLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
