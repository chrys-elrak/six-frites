import { describe, expect, it } from "vitest";
import { shownType } from "../src/preview.js";

describe("shownType", () => {
  const image = (mime: string) => ({ type: "image" as const, attachment: { mime } as never });

  it("shows keyboard GIFs and stickers as such, and everything else as sent", () => {
    expect(shownType(image("image/gif"))).toBe("gif");
    expect(shownType({ ...image("image/webp"), file: { sticker: true } })).toBe("sticker");
    expect(shownType(image("image/jpeg"))).toBe("image");
    expect(shownType({ type: "video", attachment: null })).toBe("video");
  });
});
