import { describe, expect, it } from "vitest";
import { setUserPresence } from "../src/lib/presence.js";
import { chatHelpers, prisma, useApp } from "./helpers.js";

const ctx = useApp();
const { get, makeFriends } = chatHelpers(ctx);

describe("presence devices", () => {
  it("lists the devices someone is active on, and drops each as they leave it", async () => {
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

    await setUserPresence(userId, phone, "app", false);
    expect(await seen()).toMatchObject({ online: false, devices: [] });
  });

  it("keeps someone online without a device when their client is too old to say", async () => {
    const { host, guest } = await makeFriends();
    const userId = host.user.id;
    const { id: session } = await prisma.session.findFirstOrThrow({ where: { userId } });

    await setUserPresence(userId, session, null, true);
    expect((await get(guest, `/v1/presence?ids=${userId}`)).items[0]).toMatchObject({ online: true, devices: [] });
  });
});
