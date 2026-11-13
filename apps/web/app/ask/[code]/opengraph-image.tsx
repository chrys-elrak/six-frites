import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ASK_COLORS } from "@six/shared";
import { ImageResponse } from "next/og";
import { photoData } from "@/lib/link-preview";
import { askPreview } from "./share";

export const alt = "Six Frites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const file = (path: string) => readFile(join(process.cwd(), path));

/** The picture shown when someone shares their link: their prompt, name and photo on an anonymous message card. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { t, profile } = await askPreview(code);
  const [logo, semibold, extrabold, avatar] = await Promise.all([
    file("app/icon.svg"),
    file("public/fonts/Inter-600.ttf"),
    file("public/fonts/Inter-800.ttf"),
    photoData(profile?.avatarUrl ?? null),
  ]);
  const [from, to] = ASK_COLORS[0];
  const name = profile?.displayName ?? "Six Frites";
  const prompt = profile ? (profile.prompt ?? t.prompt) : t.linkGone;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 1040,
          borderRadius: 56,
          overflow: "hidden",
          background: "white",
          boxShadow: "0 30px 80px rgba(60, 10, 20, 0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            padding: "30px 48px",
            backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            color: "white",
            fontSize: 40,
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={64} height={64} style={{ borderRadius: 16 }} />
          <span style={{ display: "block", maxWidth: 820, lineClamp: 2 }}>{prompt}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 36, padding: "44px 56px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {avatar ? (
              <img src={avatar} width={136} height={136} style={{ borderRadius: 68, objectFit: "cover" }} />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 136,
                  height: 136,
                  borderRadius: 68,
                  backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                  color: "white",
                  fontSize: 64,
                  fontWeight: 800,
                }}
              >
                {[...name][0]?.toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  color: "#1c1917",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
              <span style={{ fontSize: 30, fontWeight: 600, color: "#78716c" }}>Six Frites</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "28px 36px",
              borderRadius: 32,
              background: "#f5f5f4",
              color: "#a8a29e",
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            {t.placeholder}
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: semibold, weight: 600 },
        { name: "Inter", data: extrabold, weight: 800 },
      ],
    },
  );
}
