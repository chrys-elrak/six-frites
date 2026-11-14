import { describe, expect, it } from "vitest";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

type Who = Awaited<ReturnType<typeof signUp>>;

async function newGroup(owner: Who, extra: Record<string, unknown> = {}) {
  const res = await call(owner, "POST", "/v1/groups", { title: "Beach crew", nickname: "#CAFE00", maxMembers: 3, ...extra });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

const join = (who: Who, code: string, nickname: string) => call(who, "POST", `/v1/groups/join/${code}`, { nickname });
const texts = async (who: Who, chatId: string) =>
  ((await get(who, `/v1/chats/${chatId}/messages`)).items as { text: string | null; action: { type: string } | null }[]).map(
    (m) => m.text ?? m.action?.type,
  );

describe("groups", () => {
  it("lets people in through the link only, shows them under their nickname, and stops at the place limit", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner);
    expect(group).toMatchObject({ type: "group", title: "Beach crew", group: { maxMembers: 3, myRole: "owner" } });
    const code = group.group.inviteCode as string;

    const ana = await signUp("ana");
    const preview = await get(ana, `/v1/groups/join/${code.toLowerCase()}`);
    expect(preview).toMatchObject({ title: "Beach crew", memberCount: 1, maxMembers: 3, full: false, banned: false, chatId: null });

    await send(owner, group.id, "before you came");
    expect((await join(ana, code, "Ana")).statusCode).toBe(400);
    const joined = await join(ana, code, "#A0A0A0");
    expect(joined.statusCode, joined.body).toBe(200);
    expect(joined.json().members.map((m: { user: { displayName: string }; role: string }) => [m.user.displayName, m.role])).toEqual([
      ["#CAFE00", "owner"],
      ["#A0A0A0", "member"],
    ]);
    expect(await texts(ana, group.id)).toEqual(["joined"]);
    expect((await join(ana, code, "#A0A0A1")).statusCode).toBe(200);

    await send(ana, group.id, "hi all");
    expect((await texts(owner, group.id)).slice(0, 2)).toEqual(["hi all", "joined"]);

    const [bo, cy] = await Promise.all([signUp("bo"), signUp("cy")]);
    const races = await Promise.all([join(bo, code, "#B0B0B0"), join(cy, code, "#C0C0C0")]);
    expect(races.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(races.find((r) => r.statusCode === 409)!.json().error.code).toBe("GROUP_FULL");
    expect(await prisma.chatMember.count({ where: { chatId: group.id } })).toBe(3);

    expect((await get(ana, "/v1/contacts")).items).toEqual([]);
    expect((await get(ana, "/v1/presence?ids=" + owner.user.id)).items).toEqual([]);
    expect((await get(bo, "/v1/groups/join/ZZZZZZZZ")).error.code).toBe("GROUP_LINK_INVALID");
  });

  it("gives admins the link, the name and the members, and keeps removed people out", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const code = group.group.inviteCode as string;
    const [ana, bo] = await Promise.all([signUp("ana"), signUp("bo")]);
    await join(ana, code, "#A0A0A0");
    await join(bo, code, "#B0B0B0");

    expect((await call(ana, "PATCH", `/v1/groups/${group.id}`, { title: "Mine now" })).json().error.code).toBe("NOT_GROUP_ADMIN");
    expect((await call(ana, "PATCH", `/v1/groups/${group.id}/members/${bo.user.id}`, { role: "admin" })).statusCode).toBe(403);
    expect((await call(owner, "PATCH", `/v1/groups/${group.id}/members/${ana.user.id}`, { role: "admin" })).statusCode).toBe(200);

    const renamed = await call(ana, "PATCH", `/v1/groups/${group.id}`, { title: "Sunset crew", description: "Sun and sand", maxMembers: 5 });
    expect(renamed.json()).toMatchObject({ title: "Sunset crew", group: { description: "Sun and sand", maxMembers: 5, myRole: "admin" } });
    expect((await call(ana, "PATCH", `/v1/groups/${group.id}`, { maxMembers: 2 })).statusCode).toBe(400);

    expect((await call(ana, "DELETE", `/v1/groups/${group.id}/members/${owner.user.id}`)).statusCode).toBe(403);
    expect((await call(ana, "DELETE", `/v1/groups/${group.id}/members/${bo.user.id}`)).statusCode).toBe(204);
    expect((await get(bo, `/v1/chats/${group.id}`)).error.code).toBe("CHAT_NOT_FOUND");
    expect((await join(bo, code, "#B0B0B0")).json().error.code).toBe("GROUP_BANNED");
    expect((await get(bo, `/v1/groups/join/${code}`)).banned).toBe(true);

    const reset = await call(ana, "POST", `/v1/groups/${group.id}/link`);
    const fresh = reset.json().group.inviteCode;
    expect(fresh).not.toBe(code);
    const cy = await signUp("cy");
    expect((await join(cy, code, "#C0C0C0")).json().error.code).toBe("GROUP_LINK_INVALID");
    expect((await join(cy, fresh, "#C0C0C0")).statusCode).toBe(200);

    const me = await call(cy, "PATCH", `/v1/groups/${group.id}/me`, { nickname: "#C0FFEE" });
    expect(me.json().members.find((m: { user: { id: string } }) => m.user.id === cy.user.id).user.displayName).toBe("#C0FFEE");
    expect(await texts(owner, group.id)).toEqual(expect.arrayContaining(["group_created", "renamed", "removed", "joined"]));
  });

  it("lets admins keep the writing to themselves while members still react", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const code = group.group.inviteCode as string;
    const [ana, bo] = await Promise.all([signUp("ana"), signUp("bo")]);
    await join(ana, code, "#A0A0A0");
    await join(bo, code, "#B0B0B0");
    await call(owner, "PATCH", `/v1/groups/${group.id}/members/${bo.user.id}`, { role: "admin" });

    expect((await call(ana, "PATCH", `/v1/groups/${group.id}`, { membersCanWrite: false })).statusCode).toBe(403);
    const quiet = await call(owner, "PATCH", `/v1/groups/${group.id}`, { membersCanWrite: false });
    expect(quiet.json().group.membersCanWrite).toBe(false);
    expect((await get(ana, `/v1/chats/${group.id}`)).group.membersCanWrite).toBe(false);

    const news = (await send(bo, group.id, "admins only")).json();
    expect((await send(ana, group.id, "me too")).json().error.code).toBe("GROUP_ADMINS_ONLY");
    expect((await call(ana, "POST", `/v1/messages/${news.id}/reactions`, { emoji: "👍" })).statusCode).toBe(200);

    await call(owner, "PATCH", `/v1/groups/${group.id}`, { membersCanWrite: true });
    await send(ana, group.id, "me too");
    expect((await texts(owner, group.id)).slice(0, 2)).toEqual(["me too", "admins only"]);
  });

  it("leaves the background and auto-delete to admins", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");
    for (const body of [{ theme: "ketchup" }, { autoDeleteSecs: 86400 }]) {
      expect((await call(ana, "PATCH", `/v1/chats/${group.id}`, body)).json().error.code).toBe("NOT_GROUP_ADMIN");
    }
    expect((await call(ana, "PATCH", `/v1/chats/${group.id}`, { muted: true })).statusCode).toBe(200);
    expect((await call(owner, "PATCH", `/v1/chats/${group.id}`, { autoDeleteSecs: 86400 })).json().autoDeleteSecs).toBe(86400);
  });

  it("lets admins keep the link to themselves", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const code = group.group.inviteCode as string;
    const [ana, bo] = await Promise.all([signUp("ana"), signUp("bo")]);
    await join(ana, code, "#A0A0A0");
    await join(bo, code, "#B0B0B0");
    await call(owner, "PATCH", `/v1/groups/${group.id}/members/${bo.user.id}`, { role: "admin" });
    expect((await get(ana, `/v1/chats/${group.id}`)).group.inviteCode).toBe(code);

    expect((await call(ana, "PATCH", `/v1/groups/${group.id}`, { membersCanInvite: false })).statusCode).toBe(403);
    await call(owner, "PATCH", `/v1/groups/${group.id}`, { membersCanInvite: false });
    expect((await get(ana, `/v1/chats/${group.id}`)).group).toMatchObject({ inviteCode: null, membersCanInvite: false });
    expect((await get(bo, `/v1/chats/${group.id}`)).group.inviteCode).toBe(code);
    expect((await call(ana, "POST", `/v1/groups/${group.id}/link`)).statusCode).toBe(403);
  });

  it("keeps comments under a message, out of the chat, and lets admins close them", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");
    await call(owner, "PATCH", `/v1/groups/${group.id}`, { membersCanWrite: false });

    const news = (await send(owner, group.id, "Big news")).json();
    expect(news.thread).toEqual({ count: 0, closed: false, limit: null, closesAt: null });
    expect((await send(ana, group.id, "me too")).json().error.code).toBe("GROUP_ADMINS_ONLY");
    const comment = await send(ana, group.id, "Congrats!", { threadId: news.id });
    expect(comment.statusCode, comment.body).toBe(201);
    expect(comment.json()).toMatchObject({ threadId: news.id, thread: null });
    expect((await send(ana, group.id, "deeper", { threadId: comment.json().id })).json().error.code).toBe("MESSAGE_NOT_FOUND");

    expect(await texts(owner, group.id)).not.toContain("Congrats!");
    const thread = await get(owner, `/v1/chats/${group.id}/messages?thread=${news.id}`);
    expect(thread.items.map((m: { text: string }) => m.text)).toEqual(["Congrats!"]);
    expect(await get(owner, `/v1/chats/${group.id}`)).toMatchObject({ lastMessage: { id: news.id, thread: { count: 1 } }, unreadCount: 0 });

    expect((await call(ana, "PATCH", `/v1/messages/${news.id}/thread`, { closed: true })).json().error.code).toBe("NOT_GROUP_ADMIN");
    expect((await call(owner, "PATCH", `/v1/messages/${news.id}/thread`, { closed: true })).json().thread).toMatchObject({ count: 1, closed: true });
    expect((await send(ana, group.id, "again", { threadId: news.id })).json().error.code).toBe("THREAD_CLOSED");
    await call(owner, "PATCH", `/v1/messages/${news.id}/thread`, { closed: false });
    expect((await send(ana, group.id, "again", { threadId: news.id })).statusCode).toBe(201);

    expect((await send(owner, group.id, "Read only", { commentsClosed: true })).json().thread).toMatchObject({ count: 0, closed: true });
    await call(owner, "PATCH", `/v1/groups/${group.id}`, { membersCanWrite: true });
    expect((await send(ana, group.id, "Mine", { commentsClosed: true })).json().error.code).toBe("NOT_GROUP_ADMIN");
  });

  it("closes comments by themselves after a number of them from others, or after a while", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");
    const thread = (id: string, body: object) => call(owner, "PATCH", `/v1/messages/${id}/thread`, body);

    const poll = (await send(owner, group.id, "Two answers", { commentsLimit: 2 })).json();
    expect(poll.thread).toMatchObject({ limit: 2, closed: false });
    await send(owner, group.id, "mine don't count", { threadId: poll.id });
    await send(ana, group.id, "one", { threadId: poll.id });
    await send(owner, group.id, "still mine", { threadId: poll.id });
    expect((await send(ana, group.id, "two", { threadId: poll.id })).statusCode).toBe(201);
    expect((await send(ana, group.id, "three", { threadId: poll.id })).json().error.code).toBe("THREAD_CLOSED");
    expect((await thread(poll.id, { closed: false })).json().thread).toMatchObject({ closed: false, limit: null });
    expect((await send(ana, group.id, "three", { threadId: poll.id })).statusCode).toBe(201);
    expect((await thread(poll.id, { closed: false, commentsLimit: 3 })).json().thread).toMatchObject({ closed: true, limit: 3 });
    expect((await thread(poll.id, { closed: false, commentsLimit: 4, commentsCloseIn: 7200 })).json().thread).toMatchObject({
      closed: false,
      limit: 4,
    });

    const timed = (await send(owner, group.id, "For an hour", { commentsCloseIn: 3600 })).json();
    expect(Date.parse(timed.thread.closesAt) - Date.parse(timed.createdAt)).toBe(3600_000);
    expect((await send(ana, group.id, "in time", { threadId: timed.id })).statusCode).toBe(201);
    await prisma.message.update({ where: { id: timed.id }, data: { threadClosesAt: new Date(Date.now() - 1000) } });
    expect((await send(ana, group.id, "late", { threadId: timed.id })).json().error.code).toBe("THREAD_CLOSED");
    expect((await get(ana, `/v1/chats/${group.id}`)).lastMessage.thread.closed).toBe(true);
    expect((await send(ana, group.id, "Mine", { commentsLimit: 3 })).json().error.code).toBe("NOT_GROUP_ADMIN");
  });

  it("keeps a quote of something older than a member's arrival from showing them its text", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const secret = (await send(owner, group.id, "before you came")).json();
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");
    await send(owner, group.id, "about that", { replyToId: secret.id });

    const [reply] = (await get(ana, `/v1/chats/${group.id}/messages`)).items as { replyTo: { text: string | null; sentAt: string } | null }[];
    expect(reply!.replyTo).toMatchObject({ text: null });
    const { hiddenBefore } = await get(ana, `/v1/chats/${group.id}`);
    expect(Date.parse(reply!.replyTo!.sentAt)).toBeLessThanOrEqual(Date.parse(hiddenBefore));
    expect((await get(owner, `/v1/chats/${group.id}/messages`)).items[0].replyTo).toMatchObject({ text: "before you came" });
  });

  it("hands the group on when the owner leaves and deletes it when the last one does", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner);
    const code = group.group.inviteCode as string;
    const [ana, bo] = await Promise.all([signUp("ana"), signUp("bo")]);
    await join(ana, code, "#A0A0A0");
    await join(bo, code, "#B0B0B0");
    await call(owner, "PATCH", `/v1/groups/${group.id}/members/${bo.user.id}`, { role: "admin" });

    expect((await call(owner, "POST", `/v1/groups/${group.id}/leave`)).statusCode).toBe(204);
    expect((await get(bo, `/v1/chats/${group.id}`)).group.myRole).toBe("owner");
    expect((await join(owner, code, "#BACC00")).statusCode).toBe(200);

    for (const who of [owner, ana, bo]) await call(who, "POST", `/v1/groups/${group.id}/leave`);
    expect(await prisma.chat.findUnique({ where: { id: group.id } })).toBeNull();
  });

  it("refuses what only works between two people, and lets admins delete anyone's message", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner);
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");

    expect((await call(owner, "PATCH", `/v1/chats/${group.id}`, { vanish: true })).json().error.code).toBe("NOT_IN_GROUPS");
    const logged = await call(owner, "POST", `/v1/chats/${group.id}/calls`, { callId: "call-0001", video: false, durationSecs: null });
    expect(logged.json().error.code).toBe("NOT_IN_GROUPS");
    const game = await call(owner, "POST", `/v1/chats/${group.id}/messages`, { clientId: "g1", game: { game: "rps", hand: "rock" } });
    expect(game.json().error?.code, game.body).toBe("NOT_IN_GROUPS");

    const hers = (await send(ana, group.id, "oops")).json();
    expect((await call(ana, "DELETE", `/v1/chats/${group.id}?scope=all`)).json().error.code).toBe("NOT_GROUP_ADMIN");
    expect((await call(ana, "DELETE", `/v1/messages?ids=${hers.id}&scope=all`)).statusCode).toBe(204);
    const mine = (await send(owner, group.id, "mine")).json();
    expect((await call(ana, "DELETE", `/v1/messages?ids=${mine.id}&scope=all`)).json().error.code).toBe("NOT_MESSAGE_SENDER");
    const again = (await send(ana, group.id, "again")).json();
    expect((await call(owner, "DELETE", `/v1/messages?ids=${again.id}&scope=all`)).statusCode).toBe(204);
  });

  it("keeps someone you know under the name you gave them", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "PATCH", `/v1/contacts/${guest.user.id}`, { displayName: "Little bro" });
    const group = await newGroup(host);
    await join(guest, group.group.inviteCode, "#57A000");
    const seen = await get(host, `/v1/chats/${group.id}`);
    expect(seen.members.find((m: { user: { id: string } }) => m.user.id === guest.user.id).user.displayName).toBe("Little bro");
    expect(chatId).toBeTruthy();
  });

  it("closes a group to members for a while, then lets them write again", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const ana = await signUp("ana");
    await join(ana, group.group.inviteCode, "#A0A0A0");

    expect((await call(ana, "PATCH", `/v1/groups/${group.id}`, { closeForSecs: 3600 })).statusCode).toBe(403);
    const closed = (await call(owner, "PATCH", `/v1/groups/${group.id}`, { closeForSecs: 3600 })).json();
    expect(Date.parse(closed.group.closedUntil) - Date.now()).toBeGreaterThan(3500_000);
    expect((await send(ana, group.id, "hello?")).json().error.code).toBe("GROUP_ADMINS_ONLY");
    expect((await send(owner, group.id, "back in an hour")).statusCode).toBe(201);

    await prisma.chat.update({ where: { id: group.id }, data: { closedUntil: new Date(Date.now() - 1000) } });
    expect((await get(ana, `/v1/chats/${group.id}`)).group.closedUntil).toBeNull();
    expect((await send(ana, group.id, "open again")).statusCode).toBe(201);

    await call(owner, "PATCH", `/v1/groups/${group.id}`, { closeForSecs: 600 });
    expect((await call(owner, "PATCH", `/v1/groups/${group.id}`, { closeForSecs: null })).json().group.closedUntil).toBeNull();
    expect((await send(ana, group.id, "reopened early")).statusCode).toBe(201);
  });

  it("counts poll votes without saying who voted, and lets people change or take back their vote", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const [ana, bo] = await Promise.all([signUp("ana"), signUp("bo")]);
    await join(ana, group.group.inviteCode, "#A0A0A0");
    await join(bo, group.group.inviteCode, "#B0B0B0");

    const poll = (await call(owner, "POST", `/v1/chats/${group.id}/messages`, {
      clientId: "poll-1",
      poll: { question: "Where to?", options: ["Beach", "Mountain", "Home"] },
    })).json();
    expect(poll).toMatchObject({ type: "poll", poll: { question: "Where to?" }, votes: [], myVote: null });

    const vote = (who: Who, option: number | null) => call(who, "PUT", `/v1/messages/${poll.id}/vote`, { option });
    await vote(ana, 1);
    await vote(bo, 1);
    expect((await vote(owner, 0)).json()).toMatchObject({ votes: [1, 2], myVote: 0 });
    expect((await vote(ana, 2)).json()).toMatchObject({ votes: [1, 1, 1], myVote: 2 });
    expect((await vote(bo, null)).json()).toMatchObject({ votes: [1, 0, 1], myVote: null });
    expect((await vote(bo, 3)).json().error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(await get(bo, `/v1/chats/${group.id}/messages`))).not.toContain(ana.user.id);

    const open = (await call(owner, "POST", `/v1/chats/${group.id}/messages`, {
      clientId: "poll-open",
      poll: { question: "Who's in?", options: ["Me", "Not me"] },
      pollVisible: true,
    })).json();
    expect(open).toMatchObject({ pollVisible: true, voters: [] });
    await call(ana, "PUT", `/v1/messages/${open.id}/vote`, { option: 0 });
    expect((await call(bo, "PUT", `/v1/messages/${open.id}/vote`, { option: 1 })).json().voters).toEqual([
      { option: 0, userId: ana.user.id },
      { option: 1, userId: bo.user.id },
    ]);
    expect((await vote(ana, 0)).json()).toMatchObject({ pollVisible: false, voters: [] });

    const { host, chatId } = await makeFriends();
    const direct = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "poll-2", poll: { question: "?", options: ["a", "b"] } });
    expect(direct.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("keeps only the other members a message mentions", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const [ana, stranger] = await Promise.all([signUp("ana"), signUp("stranger")]);
    await join(ana, group.group.inviteCode, "#A0A0A0");
    const sent = (await call(owner, "POST", `/v1/chats/${group.id}/messages`, {
      clientId: "mention-1",
      text: "@#A0A0A0 look",
      mentions: [ana.user.id, stranger.user.id, owner.user.id],
    })).json();
    expect(sent.mentions).toEqual([ana.user.id]);
    const [note] = (await get(ana, "/v1/notifications")).items;
    expect(note).toMatchObject({ kind: "mention", chatId: group.id, messageId: sent.id, user: { displayName: "#CAFE00" } });
    expect((await get(stranger, "/v1/notifications")).items).toEqual([]);
  });

  it("lets a member give another a name only they see, kept over their nickname", async () => {
    const owner = await signUp("owner");
    const group = await newGroup(owner, { maxMembers: 10 });
    const [ana, stranger] = await Promise.all([signUp("ana"), signUp("stranger")]);
    await join(ana, group.group.inviteCode, "#A0A0A0");

    const named = await call(ana, "PATCH", `/v1/groups/${group.id}/members/${owner.user.id}/name`, { displayName: "Boss" });
    expect(named.statusCode, named.body).toBe(200);
    const seen = (who: Who) => get(who, `/v1/chats/${group.id}`).then((c) => c.members.find((m: { user: { id: string } }) => m.user.id === owner.user.id).user);
    expect(await seen(ana)).toMatchObject({ displayName: "Boss", alias: "#CAFE00" });
    expect(await seen(owner)).toMatchObject({ displayName: "#CAFE00" });

    expect((await call(stranger, "PATCH", `/v1/groups/${group.id}/members/${owner.user.id}/name`, { displayName: "X" })).statusCode).toBe(404);
    expect((await call(ana, "PATCH", `/v1/groups/${group.id}/members/${ana.user.id}/name`, { displayName: "Me" })).statusCode).toBe(400);
    await call(ana, "PATCH", `/v1/groups/${group.id}/members/${owner.user.id}/name`, { displayName: null });
    expect((await seen(ana)).displayName).toBe("#CAFE00");
  });
});

