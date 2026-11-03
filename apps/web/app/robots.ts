import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/chats/", "/archived", "/bot", "/inbox", "/settings", "/play/", "/add/", "/invite/", "/ask/", "/auth/", "/login"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
