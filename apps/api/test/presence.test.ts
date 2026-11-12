import type { AddressInfo } from "node:net";
import { io as connect } from "socket.io-client";
import { beforeAll, describe, expect, it } from "vitest";
import { setUserPresence } from "../src/lib/presence.js";
import { createSocketServer } from "../src/socket/index.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, makeFriends } = chatHelpers(ctx);
let url: string;

beforeAll(async () => {
  createSocketServer(ctx.app.server);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});

describe("presence devices", () => {
  it("lists the devices someone is active on, drops each as they leave it, and keeps the last one", async () => {
    const { host, guest } = await makeFriends();
    const userId = host.user.id;
    const { id: phone } = await prisma.session.findFirstOrThrow({ where: { userId } });
    const { id: laptop } = await prisma.session.create({
      data: { userId, platform: "web", refreshTokenHash: `laptop-${userId}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const { id: secondLaptop } = await prisma.session.create({
      data: { userId, platform: "web", refreshTokenHash: `laptop2-${userId}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const seen = async () => (await get(guest, `/v1/presence?ids=${userId}`)).items[0];

    await setUserPresence(userId, phone, "app", true);
    await setUserPresence(userId, laptop, "desktop", true);
    await setUserPresence(userId, secondLaptop, "desktop", true);
    expect((await seen()).devices).toEqual(["app", "desktop"]);

    await setUserPresence(userId, secondLaptop, "desktop", false);
    expect((await seen()).devices).toEqual(["app", "desktop"]);

    await setUserPresence(userId, laptop, "desktop", false);
    expect(await seen()).toMatchObject({ online: true, devices: ["app"] });

    await setUserPresence(userId, phone, "app", true);
    await setUserPresence(userId, phone, "app", false);
    expect(await seen()).toMatchObject({ online: false, devices: [], lastDevice: "app" });
  });

  it("tells an iPhone from an Android phone, and gives older phone apps both as the app", async () => {
    const { host, guest } = await makeFriends();
    const userId = host.user.id;
    const { id: iphone } = await prisma.session.findFirstOrThrow({ where: { userId } });
    const { id: android } = await prisma.session.create({
      data: { userId, platform: "android", refreshTokenHash: `android-${userId}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    const seen = async () => (await get(guest, `/v1/presence?ids=${userId}`)).items[0];

    await setUserPresence(userId, iphone, "ios", true);
    await setUserPresence(userId, android, "android", true);
    expect(await seen()).toMatchObject({ platforms: ["android", "ios"], devices: ["app"] });

    await setUserPresence(userId, android, "android", false);
    expect(await seen()).toMatchObject({ platforms: ["ios"], devices: ["app"] });

    await setUserPresence(userId, iphone, "ios", true);
    await setUserPresence(userId, iphone, "ios", false);
    expect(await seen()).toMatchObject({ online: false, platforms: [], lastPlatform: "ios", lastDevice: "app" });
  });

  it("works out Android or iOS for a phone app that only says it is the app, from how it signed in", async () => {
    const { host, guest } = await makeFriends();
    const socket = connect(url, { auth: { token: host.accessToken, device: "app" }, transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.emit("presence", { active: true });
    await new Promise((r) => setTimeout(r, 100));

    expect((await get(guest, `/v1/presence?ids=${host.user.id}`)).items[0]).toMatchObject({ platforms: ["ios"], devices: ["app"] });
    socket.disconnect();
  });

  it("keeps someone online without a device when their client is too old to say", async () => {
    const { host, guest } = await makeFriends();
    const userId = host.user.id;
    const { id: session } = await prisma.session.findFirstOrThrow({ where: { userId } });

    await setUserPresence(userId, session, null, true);
    expect((await get(guest, `/v1/presence?ids=${userId}`)).items[0]).toMatchObject({ online: true, devices: [] });
  });
});
