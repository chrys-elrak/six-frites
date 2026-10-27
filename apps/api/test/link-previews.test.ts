import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { readPreview } from "../src/services/link-previews.js";
import { chatHelpers, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get } = chatHelpers(ctx);

describe("link previews", () => {
  it("reads Open Graph tags, falling back to the page title", () => {
    const page = `<html><head>
      <title>Ignored</title>
      <meta property="og:title" content="Fries &amp; more">
      <meta content='Crispy, salted &#x2764;' name="description">
      <meta property="og:image" content="/fries.png">
    </head></html>`;
    expect(readPreview(page, new URL("https://www.frites.example/menu"))).toEqual({
      siteName: "frites.example",
      title: "Fries & more",
      description: "Crispy, salted ❤",
      image: new URL("https://www.frites.example/fries.png"),
    });
    expect(readPreview("<title> Just a title </title>", new URL("https://a.example"))?.title).toBe("Just a title");
    expect(readPreview("<p>nothing</p>", new URL("https://a.example"))).toBeNull();
  });

  it("never fetches from the server's own network", async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits++;
      res.setHeader("content-type", "text/html").end('<meta property="og:title" content="Internal">');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const reader = await signUp("reader");

    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      expect(await get(reader, `/v1/link-preview?url=${encodeURIComponent(`http://${host}:${port}/?${Math.random()}`)}`)).toBeNull();
    }
    expect(hits).toBe(0);
    server.close();
  });
});
