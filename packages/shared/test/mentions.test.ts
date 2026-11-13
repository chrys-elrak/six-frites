import { describe, expect, it } from "vitest";
import { mentionAsYou, mentionQuery, mentionsIn } from "../src/groups.js";

const member = (id: string, displayName: string, alias?: string) => ({ user: { id, displayName, avatarUrl: null, ...(alias && { alias }) } });

describe("mentions", () => {
  it("finds the other members written as @ and their nickname, under any name you gave them", () => {
    const members = [member("me", "#AAAAAA"), member("ana", "Ana from work", "#A0A0A0"), member("bo", "#B0B0B0")];
    expect(mentionsIn("@#A0A0A0 and @#B0B0B0, not @#AAAAAA or #B0B0B0", members, "me")).toEqual(["ana", "bo"]);
    expect(mentionsIn("@#A0A0A01 isn't one", members, "me")).toEqual([]);
  });

  it("spots an @ being typed before the caret", () => {
    expect(mentionQuery("hi @#a0", 7)).toEqual({ start: 3, query: "A0" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("mail@x", 6)).toBeNull();
    expect(mentionQuery("hi @#a0 there", 14)).toBeNull();
  });

  it("writes my own mentions as @You, only in a group", () => {
    const members = [member("me", "#AAAAAA"), member("ana", "#A0A0A0")];
    const group = { group: {} as never, members };
    expect(mentionAsYou("@#AAAAAA and @#A0A0A0", group, "me", "Vous")).toBe("@Vous and @#A0A0A0");
    expect(mentionAsYou("@#AAAAAA", { group: null, members }, "me", "Vous")).toBe("@#AAAAAA");
  });
});
