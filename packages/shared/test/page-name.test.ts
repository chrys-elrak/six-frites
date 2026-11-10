import { describe, expect, it } from "vitest";
import { pageName } from "../src/presence.js";

describe("pageName", () => {
  it("keeps the screen and drops ids, codes and queries", () => {
    expect(pageName("/chats/clx9f2k3j0000abcd1234efgh")).toBe("/chats/:id");
    expect(pageName("/invite/AB12CD34?from=share")).toBe("/invite/:id");
    expect(pageName("/settings")).toBe("/settings");
    expect(pageName("/")).toBe("/");
    expect(pageName("/play/abc/board")).toBe("/play/abc/board");
  });
});
