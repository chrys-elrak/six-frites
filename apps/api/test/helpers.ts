import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export { prisma };

export function useApp() {
  const ctx = {} as { app: FastifyInstance };
  beforeAll(async () => {
    ctx.app = await buildApp();
    await ctx.app.ready();
  });
  afterAll(async () => {
    await ctx.app.close();
    await prisma.$disconnect();
  });
  return ctx;
}

let seq = 0;
export const uniqueSub = (name: string) => `${name}-${Date.now().toString(36)}-${seq++}`;

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export function loginAs(app: FastifyInstance, sub: string, platform = "ios", extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/v1/auth/google",
    payload: { idToken: `google:${sub}`, device: { platform, name: "Test device" }, ...extra },
  });
}

export interface Auth {
  accessToken: string;
  user: { id: string };
}

export function chatHelpers(ctx: { app: FastifyInstance }) {
  const signUp = async (name: string, extra: Record<string, unknown> = {}): Promise<Auth> =>
    (await loginAs(ctx.app, uniqueSub(name), "ios", extra)).json();

  const get = async (who: Auth, url: string) =>
    (await ctx.app.inject({ url, headers: bearer(who.accessToken) })).json();

  const call = (who: Auth, method: "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: bearer(who.accessToken), ...(payload && { payload }) });

  const send = (who: Auth, chatId: string, text: string, extra: Record<string, unknown> = {}) =>
    call(who, "POST", `/v1/chats/${chatId}/messages`, { clientId: `c-${Math.random()}`, text, ...extra });

  async function makeFriends() {
    const host = await signUp("host");
    const invite = await call(host, "POST", "/v1/invites", {});
    const guest = await signUp("guest", { inviteCode: invite.json().code });
    const contacts = await get(host, "/v1/contacts");
    return { host, guest, chatId: contacts.items[0].chatId as string };
  }

  return { signUp, get, call, send, makeFriends };
}
