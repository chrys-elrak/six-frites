import { linkImage, linkPreview } from "@/lib/link-preview";

export const alt = "Six Frites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  return linkImage(await linkPreview("add", (await params).code));
}
