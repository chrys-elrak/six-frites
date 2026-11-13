import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type GroupLinkPreviewDTO, type InvitePreview, LOCALE_COOKIE, dict, pickLocale } from "@six/shared";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ImageResponse } from "next/og";

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TAGLINE = "Chat with the people who matter.";
const LOOKS = {
  invite: ["#34d399", "#059669"],
  group: ["#8b5cf6", "#3b82f6"],
  add: ["#38bdf8", "#6366f1"],
} as const;

export interface LinkPreview {
  title: string;
  description: string;
  colors: readonly [string, string];
  photoUrl: string | null;
  /** Its first letter stands in for a missing picture. */
  mark: string;
}

/** The app's strings in the language of whoever, or whichever crawler, asks for a link's preview. */
export async function previewDict() {
  const accepted = (await headers()).get("accept-language")?.split(",").map((tag) => tag.split(";")[0]!.trim()) ?? [];
  return dict[pickLocale([(await cookies()).get(LOCALE_COOKIE)?.value, ...accepted])];
}

/** What the API tells anyone about a link, or null when the link doesn't work. */
export async function previewOf<T>(path: string) {
  const res = await fetch(`${API_URL}/v1/${path}`, { next: { revalidate: 300 } }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/** What a shared invite, group or contact link shows: who or what it leads to, on the colours of its kind. */
export async function linkPreview(kind: keyof typeof LOOKS, code: string): Promise<LinkPreview> {
  const t = await previewDict();
  const plain = { colors: LOOKS[kind], description: TAGLINE, photoUrl: null, mark: "+" };
  if (kind === "invite") {
    const invite = await previewOf<InvitePreview>(`invites/${encodeURIComponent(code)}`);
    if (!invite) return { ...plain, title: t.common.joinMe };
    const { displayName, avatarUrl } = invite.inviter;
    return { ...plain, title: t.auth.invitedYou(displayName), description: invite.message ?? t.common.joinMe, photoUrl: avatarUrl, mark: displayName };
  }
  if (kind === "group") {
    const group = await previewOf<GroupLinkPreviewDTO>(`groups/link/${encodeURIComponent(code)}`);
    if (!group) return { ...plain, title: t.groups.join };
    return { ...plain, title: group.title, description: t.groups.join, photoUrl: group.photoUrl, mark: group.title };
  }
  return { ...plain, title: t.common.addMe };
}

/** The title and description a shared link shows, on the address it was opened at. */
export async function linkMetadata(title: string, description: string): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Six Frites" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const file = (path: string) => readFile(join(process.cwd(), path));

/** A picture as a data URL, when it's one the image renderer can draw. */
export async function photoData(url: string | null) {
  const res = url ? await fetch(url).catch(() => null) : null;
  const type = res?.ok ? res.headers.get("content-type") : null;
  if (!res || (type !== "image/jpeg" && type !== "image/png")) return null;
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/** The picture shown when the link is shared: a card with its picture, title and description. */
export async function linkImage({ title, description, colors, photoUrl, mark }: LinkPreview) {
  const [logo, semibold, extrabold, picture] = await Promise.all([
    file("app/icon.svg"),
    file("public/fonts/Inter-600.ttf"),
    file("public/fonts/Inter-800.ttf"),
    photoData(photoUrl),
  ]);
  const wash = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: wash, fontFamily: "Inter" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 44,
          width: 1040,
          padding: "56px 60px",
          borderRadius: 56,
          background: "white",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {picture ? (
            <img src={picture} width={176} height={176} style={{ borderRadius: 88, objectFit: "cover" }} />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 176,
                height: 176,
                borderRadius: 88,
                backgroundImage: wash,
                color: "white",
                fontSize: 84,
                fontWeight: 800,
              }}
            >
              {[...mark][0]?.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 58, fontWeight: 800, lineHeight: 1.15, color: "#1c1917", lineClamp: 2 }}>{title}</span>
            <span style={{ display: "block", fontSize: 32, fontWeight: 600, lineHeight: 1.3, color: "#78716c", lineClamp: 2 }}>{description}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#78716c", fontSize: 30, fontWeight: 600 }}>
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={52} height={52} style={{ borderRadius: 13 }} />
          Six Frites
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: semibold, weight: 600 },
        { name: "Inter", data: extrabold, weight: 800 },
      ],
    },
  );
}
