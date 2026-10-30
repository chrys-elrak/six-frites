import { describe, expect, it } from "vitest";
import { parseCommand, silentMessage } from "../src/commands.js";

describe("commands", () => {
  it("lists the commands a name could be", () => {
    expect(parseCommand("/")).toEqual({
      kind: "names",
      names: ["giphy", "sticker", "silent", "effect", "emoji", "game", "location", "schedule", "destruct", "voice", "autodelete", "blur", "vanish", "search"],
    });
    expect(parseCommand("/st")).toEqual({ kind: "names", names: ["sticker"] });
    expect(parseCommand("/s")).toEqual({ kind: "names", names: ["sticker", "silent", "schedule", "search"] });
    expect(parseCommand("/GI")).toEqual({ kind: "names", names: ["giphy"] });
    expect(parseCommand("/giphy")).toEqual({ kind: "names", names: ["giphy"] });
    expect(parseCommand("/x")).toBeNull();
  });

  it("runs a known command with what follows it", () => {
    expect(parseCommand("/giphy love")).toEqual({ kind: "run", name: "giphy", args: "love" });
    expect(parseCommand("/giphy  happy cat ")).toEqual({ kind: "run", name: "giphy", args: "happy cat" });
    expect(parseCommand("/giphy ")).toEqual({ kind: "run", name: "giphy", args: "" });
    expect(parseCommand("/sticker wave")).toEqual({ kind: "run", name: "sticker", args: "wave" });
    expect(parseCommand("/voice ro")).toEqual({ kind: "run", name: "voice", args: "ro" });
    expect(parseCommand("/search pizza place")).toEqual({ kind: "run", name: "search", args: "pizza place" });
  });

  it("offers a menu command only with nothing after it", () => {
    expect(parseCommand("/game ")).toEqual({ kind: "names", names: ["game"] });
    expect(parseCommand("/schedule")).toEqual({ kind: "names", names: ["schedule"] });
    expect(parseCommand("/game tonight?")).toBeNull();
  });

  it("only knows the commands it is given", () => {
    const here = ["giphy", "destruct"] as const;
    expect(parseCommand("/", here)).toEqual({ kind: "names", names: ["giphy", "destruct"] });
    expect(parseCommand("/voice", here)).toBeNull();
    expect(parseCommand("/voice ", here)).toBeNull();
  });

  it("finds the message to send silently", () => {
    expect(silentMessage("/silent see you at 6")).toBe("see you at 6");
    expect(silentMessage("/silent ")).toBe("");
    expect(silentMessage("/silent")).toBeNull();
    expect(silentMessage("see you /silent")).toBeNull();
  });

  it("leaves plain messages alone", () => {
    expect(parseCommand("hello /giphy love")).toBeNull();
    expect(parseCommand("/shrug me")).toBeNull();
    expect(parseCommand("/home/me/file")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});
