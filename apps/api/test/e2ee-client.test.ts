import { E2EE, type SecretStore, unwrap } from "@six/sdk";
import type { paths } from "@six/sdk";
import type { MessageDTO } from "@six/shared";
import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";
import { type Auth, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call } = chatHelpers(ctx);

class MemoryStore implements SecretStore {
  data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
  async clear() {
    this.data.clear();
  }
}

/** Saves like IndexedDB or a phone's files do: a moment after it is asked to. */
class SlowStore extends MemoryStore {
  override async set(key: string, value: string) {
    await new Promise((r) => setTimeout(r, 5));
    await super.set(key, value);
  }
}

/** An SDK REST client that talks to the in-process app instead of the network. */
function restFor(auth: Auth) {
  return createClient<paths>({
    baseUrl: "http://api.test",
    fetch: async (input: Request) => {
      const url = new URL(input.url);
      const body = input.body ? await input.text() : undefined;
      const res = await ctx.app.inject({
        method: input.method as "GET",
        url: url.pathname + url.search,
        headers: { ...Object.fromEntries(input.headers), authorization: `Bearer ${auth.accessToken}` },
        ...(body !== undefined && { payload: body }),
      });
      return new Response(res.statusCode === 204 ? null : res.body, {
        status: res.statusCode,
        headers: { "content-type": String(res.headers["content-type"] ?? "application/json") },
      });
    },
  });
}

interface App {
  auth: Auth;
  e2ee: E2EE;
  api: ReturnType<typeof restFor>;
}

function appFor(auth: Auth, store = new MemoryStore()): App {
  const api = restFor(auth);
  return { auth, api, e2ee: new E2EE(api, store, auth.user.id) };
}

async function setup() {
  const sub = uniqueSub("owner");
  const phone = appFor((await loginAs(ctx.app, sub)).json());
  const invite = await call(phone.auth, "POST", "/v1/invites", {});
  const guestSub = uniqueSub("friend");
  const guest = appFor((await loginAs(ctx.app, guestSub, "ios", { inviteCode: invite.json().code })).json());
  const laptop = appFor((await loginAs(ctx.app, sub)).json());
  const chatId = (await get(phone.auth, "/v1/contacts")).items[0].chatId as string;
  const members = [phone.auth.user.id, guest.auth.user.id];
  for (const a of [phone, laptop, guest]) await a.e2ee.ready();
  return { sub, guestSub, phone, laptop, guest, chatId, members };
}

let n = 0;
async function say(from: App, chatId: string, members: string[], text: string) {
  const clientId = `m-${n++}`;
  return from.e2ee.send(chatId, members, clientId, { text }, async (encrypted) =>
    unwrap(await from.api.POST("/v1/chats/{id}/messages", { params: { path: { id: chatId } }, body: { clientId, encrypted } })),
  );
}

const latest = async (a: App, chatId: string): Promise<MessageDTO> =>
  (await get(a.auth, `/v1/chats/${chatId}/messages`)).items[0];

const textOf = async (a: App, m: MessageDTO) => {
  const opened = await a.e2ee.open(m);
  return opened.status === "ok" ? opened.content.text : opened.status;
};

describe("E2EE client", () => {
  it("lets every device of both people read the conversation", async () => {
    const { phone, laptop, guest, chatId, members } = await setup();

    await say(phone, chatId, members, "hello from my phone");
    expect(await textOf(guest, await latest(guest, chatId))).toBe("hello from my phone");
    expect(await textOf(laptop, await latest(laptop, chatId))).toBe("hello from my phone");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("hello from my phone");

    await say(guest, chatId, members, "hi both of you");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("hi both of you");
    expect(await textOf(laptop, await latest(laptop, chatId))).toBe("hi both of you");

    for (let i = 0; i < 3; i++) {
      await say(laptop, chatId, members, `laptop ${i}`);
      expect(await textOf(guest, await latest(guest, chatId))).toBe(`laptop ${i}`);
      expect(await textOf(phone, await latest(phone, chatId))).toBe(`laptop ${i}`);
    }
    const again = await latest(guest, chatId);
    expect(await textOf(guest, again)).toBe("laptop 2");
  });

  it("reads a message opened twice at once", async () => {
    const { phone, guest, chatId, members } = await setup();
    const reader = appFor(guest.auth, new SlowStore());
    await reader.e2ee.ready();
    await say(phone, chatId, members, "notified and listed");
    const m = await latest(reader, chatId);
    const [a, b] = await Promise.all([textOf(reader, m), textOf(reader, m)]);
    expect([a, b]).toEqual(["notified and listed", "notified and listed"]);
  });

  it("copes with both sides starting a session at the same time", async () => {
    const { phone, guest, chatId, members } = await setup();
    const fromPhone = await say(phone, chatId, members, "you first");
    const fromGuest = await say(guest, chatId, members, "no, you");
    const items: MessageDTO[] = (await get(phone.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(await textOf(phone, items.find((m) => m.id === fromGuest.id)!)).toBe("no, you");
    const theirs: MessageDTO[] = (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(await textOf(guest, theirs.find((m) => m.id === fromPhone.id)!)).toBe("you first");

    for (let i = 0; i < 2; i++) {
      await say(phone, chatId, members, `p${i}`);
      expect(await textOf(guest, await latest(guest, chatId))).toBe(`p${i}`);
      await say(guest, chatId, members, `g${i}`);
      expect(await textOf(phone, await latest(phone, chatId))).toBe(`g${i}`);
    }
  });

  it("encrypts again when a device signs in while sending", async () => {
    const { sub, phone, guest, chatId, members } = await setup();
    let tablet: App | null = null;
    const clientId = "racing";
    await phone.e2ee.send(chatId, members, clientId, { text: "made it" }, async (encrypted) => {
      if (!tablet) {
        tablet = appFor((await loginAs(ctx.app, sub)).json());
        await tablet.e2ee.ready();
      }
      return unwrap(await phone.api.POST("/v1/chats/{id}/messages", { params: { path: { id: chatId } }, body: { clientId, encrypted } }));
    });
    expect(await textOf(tablet!, await latest(tablet!, chatId))).toBe("made it");
    expect(await textOf(guest, await latest(guest, chatId))).toBe("made it");
  });

  it("restores history on a new device with the PIN", async () => {
    const { sub, guestSub, phone, guest, chatId, members } = await setup();
    await phone.e2ee.setBackupPin("123456");
    await guest.e2ee.setBackupPin("654321");
    await say(phone, chatId, members, "before the new phone");
    await say(guest, chatId, members, "reply before");
    expect(await textOf(guest, (await get(guest.auth, `/v1/chats/${chatId}/messages`)).items[1])).toBe(
      "before the new phone",
    );
    expect(await textOf(phone, await latest(phone, chatId))).toBe("reply before");
    await new Promise((r) => setTimeout(r, 2300));

    const newPhone = appFor((await loginAs(ctx.app, sub)).json());
    await newPhone.e2ee.ready();
    const [reply, mine] = (await get(newPhone.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(await newPhone.e2ee.open(mine)).toMatchObject({ status: "unavailable", reason: "no-envelope" });

    await expect(newPhone.e2ee.unlockWithPin("654321")).rejects.toMatchObject({
      code: "WRONG_BACKUP_PIN",
      details: { triesLeft: 9 },
    });
    await newPhone.e2ee.unlockWithPin("123456");
    expect(await textOf(newPhone, mine)).toBe("before the new phone");
    expect(await textOf(newPhone, reply)).toBe("reply before");

    const newGuest = appFor((await loginAs(ctx.app, guestSub)).json());
    await newGuest.e2ee.unlockWithPin("654321");
    const theirs = (await get(newGuest.auth, `/v1/chats/${chatId}/messages`)).items;
    expect(await textOf(newGuest, theirs[1])).toBe("before the new phone");
    expect(await textOf(newGuest, theirs[0])).toBe("reply before");
  });

  it("backs up messages read before the PIN was set", async () => {
    const { sub, phone, guest, chatId, members } = await setup();
    await say(guest, chatId, members, "read before the PIN");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("read before the PIN");

    await phone.e2ee.setBackupPin("123456");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("read before the PIN");
    await new Promise((r) => setTimeout(r, 2300));

    const newPhone = appFor((await loginAs(ctx.app, sub)).json());
    await newPhone.e2ee.unlockWithPin("123456");
    expect(await textOf(newPhone, await latest(newPhone, chatId))).toBe("read before the PIN");
  });

  it("keeps the backup when the PIN changes and deletes it after 10 wrong PINs", async () => {
    const { sub, phone, guest, chatId, members } = await setup();
    await phone.e2ee.setBackupPin("111111");
    await say(guest, chatId, members, "kept");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("kept");
    await new Promise((r) => setTimeout(r, 2300));
    await phone.e2ee.setBackupPin("222222");

    const newPhone = appFor((await loginAs(ctx.app, sub)).json());
    await expect(newPhone.e2ee.unlockWithPin("111111")).rejects.toMatchObject({ code: "WRONG_BACKUP_PIN" });
    await newPhone.e2ee.unlockWithPin("222222");
    expect(await textOf(newPhone, await latest(newPhone, chatId))).toBe("kept");

    const tries = await Promise.all(
      Array.from({ length: 12 }, () => newPhone.e2ee.unlockWithPin("000000").catch((e) => e.code)),
    );
    expect(tries.filter((c) => c === "WRONG_BACKUP_PIN")).toHaveLength(10);
    expect(tries.filter((c) => c === "BACKUP_PIN_NOT_SET")).toHaveLength(2);
    await expect(newPhone.e2ee.unlockWithPin("222222")).rejects.toMatchObject({ code: "BACKUP_PIN_NOT_SET" });
    expect(await get(newPhone.auth, "/v1/me")).toMatchObject({ hasBackupPin: false, backupKeyId: null });

    await phone.e2ee.setBackupPin("333333");
    expect(await textOf(phone, await latest(phone, chatId))).toBe("kept");
    await new Promise((r) => setTimeout(r, 2300));
    const again = appFor((await loginAs(ctx.app, sub)).json());
    await again.e2ee.unlockWithPin("333333");
    expect(await textOf(again, await latest(again, chatId))).toBe("kept");

    const fresh = appFor((await loginAs(ctx.app, sub)).json());
    const user = await fresh.e2ee.setBackupPin("444444");
    expect(await phone.e2ee.hasRecoveryKey(user.backupKeyId)).toBe(false);
    expect(await phone.e2ee.hasRecoveryKey(null)).toBe(false);
  }, 15_000);

  it("agrees on safety numbers and reports a reinstall", async () => {
    const { guestSub, phone, laptop, guest, chatId, members } = await setup();
    const number = await phone.e2ee.safetyNumber(guest.auth.user.id);
    expect(await guest.e2ee.safetyNumber(phone.auth.user.id)).toBe(number);
    expect(await laptop.e2ee.safetyNumber(guest.auth.user.id)).toBe(number);

    await say(phone, chatId, members, "first contact");
    const changed: string[] = [];
    phone.e2ee.onIdentityChange((id) => changed.push(id));

    await call(guest.auth, "POST", "/v1/auth/logout");
    const reinstalled = appFor((await loginAs(ctx.app, guestSub)).json());
    await reinstalled.e2ee.ready();
    await say(phone, chatId, members, "are you new?");
    expect(changed).toEqual([guest.auth.user.id]);
    expect(await textOf(reinstalled, await latest(reinstalled, chatId))).toBe("are you new?");
    expect(await phone.e2ee.safetyNumber(guest.auth.user.id)).not.toBe(number);
  });

  it("refuses content that was moved to another message", async () => {
    const { phone, guest, chatId, members } = await setup();
    const sent = await say(phone, chatId, members, "original");
    const m = await latest(guest, chatId);
    expect(await guest.e2ee.open({ ...m, id: `${m.id}x`, clientId: "someone-else" })).toMatchObject({
      status: "unavailable",
    });
    expect(sent.id).toBe(m.id);
  });
});
