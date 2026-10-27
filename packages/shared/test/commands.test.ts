import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands.js";

describe("commands", () => {
  it("lists the commands a name could be", () => {
    expect(parseCommand("/")).toEqual({ kind: "names", names: ["giphy", "sticker"] });
    expect(parseCommand("/st")).toEqual({ kind: "names", names: ["sticker"] });
    expect(parseCommand("/GI")).toEqual({ kind: "names", names: ["giphy"] });
    expect(parseCommand("/giphy")).toEqual({ kind: "names", names: ["giphy"] });
    expect(parseCommand("/x")).toBeNull();
  });

  it("runs a known command with what follows it", () => {
    expect(parseCommand("/giphy love")).toEqual({ kind: "run", name: "giphy", args: "love" });
    expect(parseCommand("/giphy  happy cat ")).toEqual({ kind: "run", name: "giphy", args: "happy cat" });
    expect(parseCommand("/giphy ")).toEqual({ kind: "run", name: "giphy", args: "" });
    expect(parseCommand("/sticker wave")).toEqual({ kind: "run", name: "sticker", args: "wave" });
  });

  it("leaves plain messages alone", () => {
    expect(parseCommand("hello /giphy love")).toBeNull();
    expect(parseCommand("/shrug me")).toBeNull();
    expect(parseCommand("/home/me/file")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});
