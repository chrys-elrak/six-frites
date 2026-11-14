import { describe, expect, it } from "vitest";
import { lockedMessage, parseCommand, silentMessage, typedMessage } from "../src/commands.js";

describe("commands", () => {
  it("lists the commands a name could be", () => {
    expect(parseCommand("/")).toEqual({
      kind: "names",
      names: ["giphy", "sticker", "silent", "lock", "emoji", "game", "play", "location", "schedule", "voice", "vanish"],
    });
    expect(parseCommand("/st")).toEqual({ kind: "names", names: ["sticker"] });
    expect(parseCommand("/s")).toEqual({ kind: "names", names: ["sticker", "silent", "schedule"] });
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
    expect(parseCommand("/search pizza place")).toBeNull();
    expect(parseCommand("/play lu")).toEqual({ kind: "run", name: "play", args: "lu" });
  });

  it("offers a menu command only with nothing after it", () => {
    expect(parseCommand("/game ")).toEqual({ kind: "names", names: ["game"] });
    expect(parseCommand("/schedule")).toEqual({ kind: "names", names: ["schedule"] });
    expect(parseCommand("/game tonight?")).toBeNull();
  });

  it("only knows the commands it is given", () => {
    const here = ["giphy", "vanish"] as const;
    expect(parseCommand("/", here)).toEqual({ kind: "names", names: ["giphy", "vanish"] });
    expect(parseCommand("/voice", here)).toBeNull();
    expect(parseCommand("/voice ", here)).toBeNull();
  });

  it("finds the message to send silently", () => {
    expect(silentMessage("/silent see you at 6")).toBe("see you at 6");
    expect(silentMessage("/silent ")).toBe("");
    expect(silentMessage("/silent")).toBeNull();
    expect(silentMessage("see you /silent")).toBeNull();
  });

  it("finds the message to send locked", () => {
    expect(lockedMessage("/lock my code is 4711")).toBe("my code is 4711");
    expect(lockedMessage("/lock")).toBeNull();
    expect(silentMessage("/lock hi")).toBeNull();
    expect(typedMessage("/lock hi")).toBe("hi");
    expect(typedMessage("/silent hi")).toBe("hi");
    expect(typedMessage("/giphy hi")).toBeNull();
  });

  it("leaves plain messages alone", () => {
    expect(parseCommand("hello /giphy love")).toBeNull();
    expect(parseCommand("/shrug me")).toBeNull();
    expect(parseCommand("/home/me/file")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});
