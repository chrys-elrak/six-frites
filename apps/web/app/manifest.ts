import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Six Frites",
    short_name: "Six Frites",
    description: "Chat with the people who matter.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#F2711C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
