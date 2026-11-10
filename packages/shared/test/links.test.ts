import { describe, expect, it } from "vitest";
import { cleanLink, cleanLinksIn, isShareLink, messageLinks, previewLink, splitLinks } from "../src/links.js";

describe("messageLinks", () => {
  it("finds every link outside code and spoilers", () => {
    const text = "see https://a.mg and https://code.mg then www.secret.mg or www.b.mg.";
    const at = (s: string) => ({ offset: text.indexOf(s), length: s.length });
    const entities = [
      { type: "code" as const, ...at("https://code.mg") },
      { type: "spoiler" as const, ...at("www.secret.mg") },
    ];
    expect(messageLinks(text, entities)).toEqual([
      { text: "https://a.mg", href: "https://a.mg" },
      { text: "www.b.mg", href: "https://www.b.mg" },
    ]);
    expect(previewLink(text, entities)).toBe("https://a.mg");
    expect(previewLink("no links")).toBeNull();
  });
});

describe("cleanLink", () => {
  it("drops what tells a site who shared the link, and keeps what the page needs", () => {
    expect(cleanLink("https://www.instagram.com/reel/abc/?igsh=MXd6")).toBe("https://www.instagram.com/reel/abc/");
    expect(cleanLink("https://www.tiktok.com/@a/video/1?_r=1&u_code=x&_t=y")).toBe("https://www.tiktok.com/@a/video/1");
    expect(cleanLink("https://www.facebook.com/watch?v=12&mibextid=w8&rdid=r")).toBe("https://www.facebook.com/watch?v=12");
    expect(cleanLink("https://x.com/a/status/1?s=20&t=abc")).toBe("https://x.com/a/status/1");
    expect(cleanLink("https://youtu.be/xyz?si=me&t=42")).toBe("https://youtu.be/xyz?t=42");
    expect(cleanLink("https://shop.mg/?utm_source=fb&id=3")).toBe("https://shop.mg/?id=3");
    expect(cleanLink("https://a.mg")).toBe("https://a.mg");
    expect(cleanLink("https://x.com/search?q=frites")).toBe("https://x.com/search?q=frites");
    expect(splitLinks("www.instagram.com/p/x?igshid=1")[0]!.href).toBe("https://www.instagram.com/p/x");
  });

  it("knows the short links whose code names the sender", () => {
    expect(isShareLink("https://vt.tiktok.com/ZS123/")).toBe(true);
    expect(isShareLink("https://www.tiktok.com/t/ZT1/")).toBe(true);
    expect(isShareLink("https://www.instagram.com/share/reel/abc")).toBe(true);
    expect(isShareLink("https://www.facebook.com/share/r/abc/")).toBe(true);
    expect(isShareLink("https://www.tiktok.com/@a/video/1")).toBe(false);
    expect(isShareLink("https://www.facebook.com/sharer.php?u=x")).toBe(false);
  });
});

describe("cleanLinksIn", () => {
  it("rewrites the links in a message and moves its formatting with them", async () => {
    const text = "look www.instagram.com/p/x/?igsh=abc and https://vt.tiktok.com/ZS1/ ok";
    const at = (s: string) => ({ offset: text.indexOf(s), length: s.length });
    const entities = [
      { type: "bold" as const, ...at("look") },
      { type: "italic" as const, ...at("www.instagram.com/p/x/?igsh=abc") },
      { type: "bold" as const, ...at("ok") },
    ];
    const resolve = async (link: string) => (link.includes("vt.tiktok") ? "https://www.tiktok.com/@a/video/1?_r=1&u_code=z" : null);
    const out = await cleanLinksIn(text, entities, resolve);
    expect(out.text).toBe("look www.instagram.com/p/x/ and https://www.tiktok.com/@a/video/1 ok");
    const span = (e: { offset: number; length: number }) => out.text.slice(e.offset, e.offset + e.length);
    expect(out.entities.map(span)).toEqual(["look", "www.instagram.com/p/x/", "ok"]);
  });

  it("keeps a share link it can't follow", async () => {
    expect((await cleanLinksIn("https://vt.tiktok.com/ZS1/", [], async () => null)).text).toBe("https://vt.tiktok.com/ZS1/");
    expect((await cleanLinksIn("https://vt.tiktok.com/ZS1/", [], () => Promise.reject(new Error("offline")))).text).toBe(
      "https://vt.tiktok.com/ZS1/",
    );
  });
});
