import { describe, expect, it, vi } from "vitest";
import { deleteExpiredStories } from "../src/services/stories.js";
import { pairAlias } from "../src/services/users.js";
import { type Auth, chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { signUp, get, call, send, makeFriends } = chatHelpers(ctx);

const readyUpload = (ownerId: string, kind: "image" | "video", durationMs: number | null = null) =>
  prisma.upload.create({
    data: { ownerId, kind, status: "ready", name: "x", mime: "video/mp4", size: 1, key: `test/${Math.random()}`, durationMs },
  });

describe("stories", () => {
  it("shows to contacts only, tracks who opened it, and is gone once its time is up", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");

    const posted = await call(host, "POST", "/v1/stories", {
      text: "hello",
      background: "#2563eb",
      location: { lat: -18.9, lng: 47.5, name: "Tana" },
      showTime: true,
      durationSecs: 6 * 3600,
    });
    expect(posted.statusCode).toBe(201);
    const story = posted.json();
    expect(story).toMatchObject({ type: "text", seen: true, viewCount: 0, showTime: true, showDate: false });
    expect(Date.parse(story.expiresAt) - Date.parse(story.createdAt)).toBeCloseTo(6 * 3600 * 1000, -3);

    const feed = await get(guest, "/v1/stories");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].user.id).toBe(host.user.id);
    expect(feed.items[0].stories[0]).toMatchObject({ id: story.id, seen: false, viewCount: null, location: { name: "Tana" } });
    expect((await get(stranger, "/v1/stories")).items).toHaveLength(0);
    expect((await call(stranger, "POST", `/v1/stories/${story.id}/view`)).statusCode).toBe(404);

    expect((await call(guest, "POST", `/v1/stories/${story.id}/view`)).statusCode).toBe(204);
    expect((await get(guest, "/v1/stories")).items[0].stories[0].seen).toBe(true);
    const viewers = await get(host, `/v1/stories/${story.id}/viewers`);
    expect(viewers.items.map((v: { user: { id: string } }) => v.user.id)).toEqual([guest.user.id]);
    expect((await get(guest, `/v1/stories/${story.id}/viewers`)).error.code).toBe("STORY_NOT_FOUND");

    await call(host, "POST", `/v1/users/${guest.user.id}/block`);
    expect((await get(guest, "/v1/stories")).items).toHaveLength(0);
    await call(host, "DELETE", `/v1/users/${guest.user.id}/block`);

    await prisma.story.update({ where: { id: story.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await get(guest, "/v1/stories")).items).toHaveLength(0);
    expect(await deleteExpiredStories()).toBeGreaterThanOrEqual(1);
    expect(await prisma.story.findUnique({ where: { id: story.id } })).toBeNull();
  });

  it("takes photos and videos of up to 30 seconds, and lets the poster take one down", async () => {
    const { host, guest } = await makeFriends();

    const long = await readyUpload(host.user.id, "video", 45_000);
    expect((await call(host, "POST", "/v1/stories", { uploadId: long.id })).json().error.code).toBe("VALIDATION_FAILED");

    const clip = await readyUpload(host.user.id, "video", 29_800);
    const story = (await call(host, "POST", "/v1/stories", { uploadId: clip.id, text: "caption" })).json();
    expect(story).toMatchObject({ type: "video", text: "caption", media: { id: clip.id } });
    expect((await call(host, "POST", "/v1/stories", { uploadId: clip.id })).json().error.code).toBe("UPLOAD_IN_USE");
    expect((await get(guest, "/v1/stories")).items[0].stories).toHaveLength(1);

    expect((await call(guest, "DELETE", `/v1/stories/${story.id}`)).statusCode).toBe(404);
    expect((await call(host, "DELETE", `/v1/stories/${story.id}`)).statusCode).toBe(204);
    expect((await get(guest, "/v1/stories")).items).toHaveLength(0);
    expect(await prisma.upload.findUnique({ where: { id: clip.id } })).toBeNull();
  });

  it("needs something to show and a duration between an hour and a day", async () => {
    const { host } = await makeFriends();
    expect((await call(host, "POST", "/v1/stories", {})).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "hi", durationSecs: 60 })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "hi", durationSecs: 86400 + 1 })).statusCode).toBe(400);
  });

  it("keeps a contact's reactions, as many as they like, only in who opened the story and never as messages", async () => {
    const { host, guest } = await makeFriends();
    const story = (await call(host, "POST", "/v1/stories", { text: "hello" })).json();
    const messages = await prisma.message.count({ where: { senderId: guest.user.id } });

    expect((await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "🔥" })).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "❤️" })).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "🍕" })).statusCode).toBe(400);
    expect((await call(host, "POST", `/v1/stories/${story.id}/react`, { emoji: "❤️" })).statusCode).toBe(404);

    await Promise.all(["❤️", "❤️", "😂"].map((emoji) => call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji })));
    const [seen] = (await get(host, `/v1/stories/${story.id}/viewers`)).items;
    expect(seen.user.id).toBe(guest.user.id);
    expect(seen.reactions).toHaveLength(5);
    expect([...seen.reactions].sort()).toEqual(["❤️", "❤️", "❤️", "🔥", "😂"].sort());
    for (let i = 0; i < 30; i++) await call(guest, "POST", `/v1/stories/${story.id}/react`, { emoji: "👏" });
    expect((await get(host, `/v1/stories/${story.id}/viewers`)).items[0].reactions).toEqual(Array(30).fill("👏"));
    expect((await get(guest, "/v1/stories")).items[0].stories[0].seen).toBe(true);
    expect(await prisma.message.count({ where: { senderId: guest.user.id } })).toBe(messages);
  });

  it("lets a contact answer a story in your chat, with what the story was", async () => {
    const { host, guest, chatId } = await makeFriends();
    const story = (await call(host, "POST", "/v1/stories", { text: "Beach day", background: "#f59e0b,#e11d48" })).json();
    const reply = await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "story-reply", text: "🔥", storyId: story.id });
    expect(reply.statusCode, reply.body).toBe(201);
    expect(reply.json().story).toEqual({
      id: story.id,
      ownerId: host.user.id,
      kind: "text",
      text: "Beach day",
      background: "#f59e0b,#e11d48",
      imageUrl: null,
    });
    const upload = await readyUpload(host.user.id, "image");
    const photo = (await call(host, "POST", "/v1/stories", { uploadId: upload.id })).json();
    const onPhoto = await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "photo-reply", text: "😍", storyId: photo.id });
    expect(onPhoto.json().story).toMatchObject({ kind: "image", imageUrl: expect.stringContaining(encodeURI(upload.key)) });
    const mine = await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "own-story", text: "hi", storyId: story.id });
    expect(mine.json().error.code).toBe("STORY_NOT_FOUND");
    const other = await makeFriends();
    const elsewhere = await call(other.guest, "POST", `/v1/chats/${other.chatId}/messages`, { clientId: "x", text: "hi", storyId: story.id });
    expect(elsewhere.json().error.code).toBe("STORY_NOT_FOUND");
  });

  it("shows a note to contacts for a day, replaces it with the next, and lets them answer it in the chat", async () => {
    const { host, guest, chatId } = await makeFriends();
    const stranger = await signUp("stranger");
    expect((await call(host, "PUT", "/v1/notes", { text: "x".repeat(61) })).statusCode).toBe(400);
    await call(host, "PUT", "/v1/notes", { text: "Coffee?" });
    const note = (await call(host, "PUT", "/v1/notes", { text: "  Beach at 5  " })).json();
    expect(note.text).toBe("Beach at 5");

    expect((await get(host, "/v1/notes")).mine).toMatchObject({ text: "Beach at 5" });
    const seen = await get(guest, "/v1/notes");
    expect(seen.mine).toBeNull();
    expect(seen.items).toMatchObject([{ user: { id: host.user.id }, note: { id: note.id, text: "Beach at 5" } }]);
    expect((await get(stranger, "/v1/notes")).items).toEqual([]);

    const reply = await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "note-reply", text: "I'm in", storyId: note.id });
    expect(reply.json().story).toEqual({ id: note.id, ownerId: host.user.id, kind: "note", text: "Beach at 5", background: null, imageUrl: null });

    await call(host, "DELETE", "/v1/notes");
    expect((await get(guest, "/v1/notes")).items).toEqual([]);
    const later = (await call(guest, "PUT", "/v1/notes", { text: "Gone tomorrow" })).json();
    expect(Date.parse(later.expiresAt) - Date.parse(later.createdAt)).toBeCloseTo(24 * 3600 * 1000, -3);
    const short = (await call(guest, "PUT", "/v1/notes", { text: "Quick one", durationSecs: 3 * 3600 })).json();
    expect(Date.parse(short.expiresAt) - Date.parse(short.createdAt)).toBeCloseTo(3 * 3600 * 1000, -3);
    expect((await call(guest, "PUT", "/v1/notes", { text: "Too long", durationSecs: 25 * 3600 })).statusCode).toBe(400);
    await prisma.note.update({ where: { id: short.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await get(host, "/v1/notes")).items).toEqual([]);
  });

  it("keeps a contact's reactions to a note in who opened it, and tells the author", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");
    const note = (await call(host, "PUT", "/v1/notes", { text: "Beach at 5" })).json();

    expect((await call(guest, "POST", `/v1/notes/${note.id}/react`, { emoji: "🔥" })).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/notes/${note.id}/react`, { emoji: "🔥" })).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/notes/${note.id}/react`, { emoji: "🍕" })).statusCode).toBe(400);
    expect((await call(host, "POST", `/v1/notes/${note.id}/react`, { emoji: "❤️" })).statusCode).toBe(404);
    expect((await call(stranger, "POST", `/v1/notes/${note.id}/react`, { emoji: "❤️" })).statusCode).toBe(404);

    const [seen] = (await get(host, "/v1/notes/viewers")).items;
    expect(seen).toMatchObject({ user: { id: guest.user.id }, reactions: ["🔥", "🔥"] });
    const notified = await prisma.notification.findMany({ where: { userId: host.user.id, kind: "note_reaction" } });
    expect(notified).toMatchObject([{ actorId: guest.user.id, emoji: "🔥" }]);
  });

  it("tells the author which contacts opened their note, and starts over with a new note", async () => {
    const { host, guest } = await makeFriends();
    const stranger = await signUp("stranger");
    const note = (await call(host, "PUT", "/v1/notes", { text: "Who's up?" })).json();
    expect(note.viewCount).toBe(0);
    expect((await call(stranger, "POST", `/v1/notes/${note.id}/view`)).statusCode).toBe(404);
    expect((await call(host, "POST", `/v1/notes/${note.id}/view`)).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/notes/${note.id}/view`)).statusCode).toBe(204);
    expect((await call(guest, "POST", `/v1/notes/${note.id}/view`)).statusCode).toBe(204);
    expect((await get(host, "/v1/notes")).mine.viewCount).toBe(1);
    expect((await get(guest, "/v1/notes")).items[0].note.viewCount).toBeNull();
    expect((await get(host, "/v1/notes/viewers")).items).toMatchObject([{ user: { id: guest.user.id }, clickedAt: null }]);
    expect((await get(guest, "/v1/notes/viewers")).items).toEqual([]);
    expect((await call(stranger, "POST", `/v1/notes/${note.id}/click`)).statusCode).toBe(404);
    expect((await call(guest, "POST", `/v1/notes/${note.id}/click`)).statusCode).toBe(204);
    expect((await get(host, "/v1/notes/viewers")).items[0].clickedAt).toEqual(expect.any(String));
    await call(host, "PUT", "/v1/notes", { text: "Anyone?" });
    expect((await get(host, "/v1/notes/viewers")).items).toEqual([]);
  });

  it("leaves the chat unread when someone answers a story without opening it, but not when they write in it", async () => {
    const { host, guest, chatId } = await makeFriends();
    await call(host, "POST", `/v1/chats/${chatId}/messages`, { clientId: "before-story", text: "You there?" });
    const story = (await call(host, "POST", "/v1/stories", { text: "Sunset" })).json();
    await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "story-answer", text: "Wow", storyId: story.id });
    expect((await get(guest, `/v1/chats/${chatId}`)).unreadCount).toBeGreaterThan(0);
    await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "typed", text: "Yes!" });
    expect((await get(guest, `/v1/chats/${chatId}`)).unreadCount).toBe(0);
  });

  it("colours a note for everyone, and refuses one with neither text nor a GIF", async () => {
    const { host, guest, chatId } = await makeFriends();
    expect((await call(host, "PUT", "/v1/notes", { text: "  " })).statusCode).toBe(400);
    expect((await call(host, "PUT", "/v1/notes", { text: "Hi", background: "red" })).statusCode).toBe(400);
    const note = (await call(host, "PUT", "/v1/notes", { text: "Hi", background: "#E11D48" })).json();
    expect(note).toMatchObject({ background: "#e11d48", gif: null });
    expect((await get(guest, "/v1/notes")).items[0].note).toMatchObject({ background: "#e11d48" });
    const reply = await call(guest, "POST", `/v1/chats/${chatId}/messages`, { clientId: "note-colour", text: "Hey", storyId: note.id });
    expect(reply.json().story).toMatchObject({ kind: "note", text: "Hi", background: "#e11d48" });
  });

  it("names the place on a story from OpenStreetMap, asking once per spot", async () => {
    const { host } = await makeFriends();
    const answer = { address: { suburb: "Analakely", city: "Antananarivo" } };
    const osm = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(answer)));
    const ask = () => get(host, "/v1/place-name?lat=-18.9067&lng=47.5245&locale=fr");
    expect(await ask()).toEqual({ name: "Analakely, Antananarivo" });
    expect(await ask()).toEqual({ name: "Analakely, Antananarivo" });
    expect(osm).toHaveBeenCalledTimes(1);
    osm.mockRestore();
  });

  it("keeps where the poster dragged each sticker and how big they made it", async () => {
    const { host } = await makeFriends();
    const positions = { location: { x: 0.2, y: 0.15, scale: 1.8 }, time: { x: 0.8, y: 0.9 } };
    const story = (await call(host, "POST", "/v1/stories", { text: "hi", showTime: true, location: { lat: 1, lng: 2 }, positions })).json();
    expect(story.positions).toEqual(positions);
    expect((await call(host, "POST", "/v1/stories", { text: "hi" })).json().positions).toEqual({});
    expect((await call(host, "POST", "/v1/stories", { text: "hi", positions: { date: { x: 1.5, y: 0 } } })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "hi", positions: { date: { x: 0.5, y: 0.5, scale: 10 } } })).statusCode).toBe(400);
  });

  it("keeps lines, arrows and text drawn on top, and takes a drawing alone as a story", async () => {
    const { host, guest } = await makeFriends();
    const drawing = {
      strokes: [
        { shape: "pen", color: "#ff0000", size: 0.01, points: [0.1, 0.1, 0.2, 0.3, 0.4, 0.2] },
        { shape: "arrow", color: "#ffffff", size: 0.016, points: [0.2, 0.8, 0.6, 0.5] },
      ],
      texts: [{ text: "look", color: "#ffffff", font: "marker", x: 0.5, y: 0.4, scale: 1.5, look: "box" }],
    };
    expect((await call(host, "POST", "/v1/stories", { drawing })).json().drawing).toEqual(drawing);
    const [group] = (await get(guest, "/v1/stories")).items;
    expect(group.stories[0].drawing).toEqual(drawing);
    expect((await call(host, "POST", "/v1/stories", { text: "hi" })).json().drawing).toEqual({ strokes: [], texts: [] });
    const bad = { strokes: [{ shape: "star", color: "#fff000", size: 0.01, points: [0, 0, 1, 1] }] };
    expect((await call(host, "POST", "/v1/stories", { text: "hi", drawing: bad })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { drawing: { strokes: [], texts: [] } })).statusCode).toBe(400);
  });

  it("shares an anonymous message you received as a card, photos included", async () => {
    const { host, guest } = await makeFriends();
    const { askCode } = await get(host, "/v1/me");
    expect((await call(guest, "POST", `/v1/ask/${askCode}`, { text: "Who's your crush?" })).statusCode).toBe(204);
    const [received] = (await get(host, "/v1/ask")).items;
    const story = await call(host, "POST", "/v1/stories", { askId: received.id, text: "Nobody 😇" });
    expect(story.statusCode).toBe(201);
    expect(story.json()).toMatchObject({ ask: { text: "Who's your crush?", prompt: null }, text: "Nobody 😇" });
    expect((await call(guest, "POST", "/v1/stories", { askId: received.id })).statusCode).toBe(404);

    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect((await call(guest, "POST", `/v1/ask/${askCode}`, { photo: pixel })).statusCode).toBe(204);
    const photo = (await get(host, "/v1/ask")).items.find((m: { photoUrl: string | null }) => m.photoUrl);
    const withPhoto = (await call(host, "POST", "/v1/stories", { askId: photo.id })).json();
    expect(withPhoto.ask).toMatchObject({ text: "", photoUrl: expect.stringMatching(/^https?:/), gif: null });
  });

  it("carries a link, and an invitation to your anonymous link as it is now", async () => {
    const { host, guest } = await makeFriends();
    const story = await call(host, "POST", "/v1/stories", { link: { url: "https://example.com/a", label: "My shop" }, askLink: true, askText: "Ask me anything" });
    expect(story.statusCode).toBe(201);
    const { askCode } = await get(host, "/v1/me");
    expect(story.json()).toMatchObject({ link: { url: "https://example.com/a", label: "My shop" }, askCode, askText: "Ask me anything" });
    expect(JSON.stringify((await get(guest, "/v1/stories")).items)).toContain(askCode);
    expect((await call(host, "POST", "/v1/stories", { link: { url: "javascript:alert(1)" } })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "hi" })).json()).toMatchObject({ link: null, askCode: null });
  });

  it("shows several anonymous messages on one story, each once", async () => {
    const { host, guest } = await makeFriends();
    const { askCode } = await get(host, "/v1/me");
    for (const text of ["one", "two", "three"]) expect((await call(guest, "POST", `/v1/ask/${askCode}`, { text })).statusCode).toBe(204);
    const ids = (await get(host, "/v1/ask")).items.map((m: { id: string }) => m.id);
    const story = await call(host, "POST", "/v1/stories", { askIds: ids, positions: { ask3: { x: 0.5, y: 0.2, rotate: -30 } } });
    expect(story.statusCode).toBe(201);
    expect(story.json().asks.map((a: { text: string }) => a.text)).toEqual(["three", "two", "one"]);
    expect(story.json()).toMatchObject({ ask: { text: "three" }, positions: { ask3: { x: 0.5, y: 0.2, rotate: -30 } } });
    expect((await call(host, "POST", "/v1/stories", { askIds: [ids[0], ids[0]] })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "hi", positions: { date: { x: 0.5, y: 0.5, rotate: 200 } } })).statusCode).toBe(400);
  });

  it("takes any colour or a two colour gradient behind a text story", async () => {
    const { host } = await makeFriends();
    const post = (background: string) => call(host, "POST", "/v1/stories", { text: "hi", background });
    expect((await post("#123ABC")).json()).toMatchObject({ background: "#123abc" });
    expect((await post("#f59e0b,#e11d48")).json()).toMatchObject({ background: "#f59e0b,#e11d48" });
    expect((await post("red")).statusCode).toBe(400);
    expect((await post("#f59e0b,#e11d48,#000000")).statusCode).toBe(400);
  });

  it("keeps a chat message shared as it was, so it shows as a bubble or in quotes", async () => {
    const { host } = await makeFriends();
    expect((await call(host, "POST", "/v1/stories", { text: "on arrive", fromChat: true, bubble: "#B8325A,#FFFFFF" })).json()).toMatchObject({
      fromChat: true,
      bubble: "#b8325a,#ffffff",
    });
    expect((await call(host, "POST", "/v1/stories", { text: "x", fromChat: true, bubble: "red" })).statusCode).toBe(400);
    expect((await call(host, "POST", "/v1/stories", { text: "plain", bubble: "#000000,#ffffff" })).json()).toMatchObject({ fromChat: false, bubble: null });
    expect((await call(host, "PUT", "/v1/notes", { text: "on arrive", fromChat: true })).json()).toMatchObject({ fromChat: true });
    expect((await get(host, "/v1/notes")).mine).toMatchObject({ text: "on arrive", fromChat: true });
  });

  it("shows who sent a shared message, as the poster sees them, and when", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(guest, chatId, "on arrive")).json();
    const seen = (await get(host, "/v1/contacts")).items[0].user;
    const story = (await call(host, "POST", "/v1/stories", { text: "on arrive", fromChat: true, messageId: sent.id })).json();
    expect(story.quote).toEqual({
      from: expect.objectContaining({ id: seen.id, displayName: seen.displayName }),
      sentAt: sent.createdAt,
    });
    const stranger = await signUp("stranger");
    const res = await call(stranger, "POST", "/v1/stories", { text: "on arrive", fromChat: true, messageId: sent.id });
    expect(res.json().error.code).toBe("MESSAGE_NOT_FOUND");
  });

  it("puts a place on a note, even a note that is only a place, for contacts to see", async () => {
    const { host, guest } = await makeFriends();
    const location = { lat: -18.9137, lng: 47.5361, name: "Analakely" };
    expect((await call(host, "PUT", "/v1/notes", { text: "", location })).json()).toMatchObject({ text: "", location });
    const seen = (await get(guest, "/v1/notes")).items.find((n: { user: { id: string } }) => n.user.id === host.user.id);
    expect(seen.note.location).toEqual(location);
    expect((await call(host, "PUT", "/v1/notes", { text: "" })).statusCode).toBe(400);
  });

  it("tells the sender in the chat when their message is shared to a story or as a note, but not your own", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(guest, chatId, "on arrive")).json();
    const latest = async () => (await get(guest, `/v1/chats/${chatId}/messages`)).items[0];
    await call(host, "POST", "/v1/stories", { text: "on arrive", fromChat: true, messageId: sent.id });
    expect(await latest()).toMatchObject({ type: "service", senderId: host.user.id, action: { type: "shared_to", to: "story" } });
    await call(host, "PUT", "/v1/notes", { text: "on arrive", fromChat: true, messageId: sent.id });
    expect(await latest()).toMatchObject({ type: "service", senderId: host.user.id, action: { type: "shared_to", to: "note" } });

    const mine = (await send(host, chatId, "mine")).json();
    await call(host, "POST", "/v1/stories", { text: "mine", fromChat: true, messageId: mine.id });
    expect((await latest()).id).toBe(mine.id);
  });

  it("shows the sender of a shared message to each viewer as they would see them, not as the poster does", async () => {
    const { host, guest, chatId } = await makeFriends();
    await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: guest.user.id } }, data: { showProfile: true } });
    const sent = (await send(guest, chatId, "on arrive")).json();
    await call(host, "POST", "/v1/stories", { text: "on arrive", fromChat: true, messageId: sent.id });
    const third = await signUp("third", { inviteCode: (await call(host, "POST", "/v1/invites", {})).json().code });

    const quoteSeenBy = async (who: Auth) =>
      (await get(who, "/v1/stories")).items.find((g: { user: { id: string } }) => g.user.id === host.user.id).stories[0].quote;
    expect((await quoteSeenBy(third)).from).toEqual({ id: guest.user.id, displayName: pairAlias(third.user.id, guest.user.id), avatarUrl: null });
    const real = (await prisma.user.findUniqueOrThrow({ where: { id: guest.user.id } })).displayName;
    expect((await quoteSeenBy(host)).from.displayName).toBe(real);
    expect(real).not.toBe(pairAlias(third.user.id, guest.user.id));
  });

  it("shows who sent a message made into a note, and keeps it when only its colour changes", async () => {
    const { host, guest, chatId } = await makeFriends();
    const sent = (await send(guest, chatId, "see you")).json();
    const note = (await call(host, "PUT", "/v1/notes", { text: "see you", fromChat: true, messageId: sent.id })).json();
    expect(note.quote).toEqual({ from: expect.objectContaining({ id: sent.senderId }), sentAt: sent.createdAt });
    const recoloured = (await call(host, "PUT", "/v1/notes", { text: "see you", fromChat: true, background: "#e11d48" })).json();
    expect(recoloured).toMatchObject({ background: "#e11d48", quote: note.quote });
    expect((await call(host, "PUT", "/v1/notes", { text: "changed" })).json().quote).toBeNull();
  });

  it("writes a note in the font picked, and in the app's own for classic", async () => {
    const { host } = await makeFriends();
    expect((await call(host, "PUT", "/v1/notes", { text: "bonjour", font: "script" })).json()).toMatchObject({ font: "script" });
    expect((await call(host, "PUT", "/v1/notes", { text: "bonjour", font: "classic" })).json()).toMatchObject({ font: null });
    expect((await call(host, "PUT", "/v1/notes", { text: "bonjour", font: "comic" })).statusCode).toBe(400);
  });
});
