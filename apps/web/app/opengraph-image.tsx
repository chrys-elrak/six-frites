import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Six Frites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const file = (path: string) => readFile(join(process.cwd(), path));

export default async function Image() {
  const [logo, semibold, extrabold] = await Promise.all([
    file("app/icon.svg"),
    file("public/fonts/Inter-600.ttf"),
    file("public/fonts/Inter-800.ttf"),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        backgroundImage: "linear-gradient(135deg, #FFB547, #F2711C)",
        fontFamily: "Inter",
        color: "white",
      }}
    >
      <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={200} height={200} style={{ borderRadius: 48 }} />
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>Six Frites</div>
      <div style={{ fontSize: 40, fontWeight: 600, opacity: 0.9 }}>Chat with the people who matter.</div>
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
