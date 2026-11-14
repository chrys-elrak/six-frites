import { describe, expect, it } from "vitest";
import { mentionAsYou, mentionOptions, mentionQuery, mentionsIn, myMentions, typingLabel } from "../src/groups.js";
import { dict } from "../src/i18n/index.js";

const member = (id: string, displayName: string, alias?: string, role: "owner" | "admin" | "member" = "member") => ({
  user: { id, displayName, avatarUrl: null, ...(alias && { alias }) },
  role,
  lastDeliveredMessageId: null,
  lastDeliveredAt: null,
  lastReadMessageId: null,
  lastReadAt: null,
});

describe("mentions", () => {
  it("finds the other members written as @ and their nickname, under any name you gave them", () => {
    const members = [member("me", "#AAAAAA"), member("ana", "Ana from work", "#A0A0A0"), member("bo", "#B0B0B0")];
    expect(mentionsIn("@#A0A0A0 and @#B0B0B0, not @#AAAAAA or #B0B0B0", members, "me")).toEqual(["ana", "bo"]);
    expect(mentionsIn("@#A0A0A01 isn't one", members, "me")).toEqual([]);
  });

  it("spots an @ being typed before the caret", () => {
    expect(mentionQuery("hi @#a0", 7)).toEqual({ start: 3, query: "#a0" });
    expect(mentionQuery("hi @ev", 6)).toEqual({ start: 3, query: "ev" });
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

  it("mentions the admins with @admin, and everyone with @everyone only from an admin", () => {
    const owner = member("owner", "#000001", undefined, "owner");
    const admin = member("admin", "#000002", undefined, "admin");
    const ana = member("ana", "#A0A0A0");
    const bo = member("bo", "#B0B0B0");
    const members = [owner, admin, ana, bo];
    expect(mentionsIn("@admin help", members, "ana")).toEqual(["owner", "admin"]);
    expect(mentionsIn("@everyone hi", members, "ana")).toEqual([]);
    expect(mentionsIn("@everyone hi", members, "admin")).toEqual(["owner", "ana", "bo"]);
  });

  it("suggests @everyone to admins only, @admin to all, then members", () => {
    const members = [member("owner", "#000001", undefined, "owner"), member("ana", "#A0A0A0"), member("bo", "#B0B0B0")];
    const chat = { members };
    expect(mentionOptions(chat, "owner", "").map((o) => o.insert)).toEqual(["@everyone", "@admin", "@#A0A0A0", "@#B0B0B0"]);
    expect(mentionOptions(chat, "ana", "").map((o) => o.insert)).toEqual(["@admin", "@#000001", "@#B0B0B0"]);
    expect(mentionOptions(chat, "ana", "ad").map((o) => o.insert)).toEqual(["@admin"]);
    expect(mentionOptions(chat, "owner", "#b").map((o) => o.insert)).toEqual(["@#B0B0B0"]);
  });

  it("shows other members' mentions by the names I gave them", () => {
    const members = [member("me", "#AAAAAA"), member("ana", "Cocombre", "#A0A0A0"), member("bo", "#B0B0B0")];
    const mine = myMentions({ group: {} as never, members }, "me")!;
    expect(mine.nickname).toBe("@#AAAAAA");
    expect(Object.fromEntries(mine.names)).toEqual({ "@#A0A0A0": "@Cocombre" });
  });

  it("says who is typing in a group, and only what in a direct chat", () => {
    const members = [member("me", "#AAAAAA"), member("ana", "Cocombre", "#A0A0A0"), member("bo", "#B0B0B0")];
    const fr = dict.fr;
    expect(typingLabel({ group: {} as never, members }, [["ana", "voice"]], fr)).toBe("Cocombre enregistre un audio…");
    expect(typingLabel({ group: {} as never, members }, [["ana", "text"], ["bo", "text"]], fr)).toBe("2 personnes écrivent…");
    expect(typingLabel({ group: null, members }, [["ana", "text"]], fr)).toBe("écrit…");
    expect(typingLabel({ group: null, members }, [], fr)).toBeNull();
  });
});
