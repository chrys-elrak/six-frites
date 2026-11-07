import { env } from "../src/env.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { totp, totpStep } from "../src/lib/totp.js";

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
  user: { id: string; email: string };
}

/** Lets this person use what's for admins outside moderation, like making sticker packs, as if listed in ADMIN_EMAILS. */
export function makeAdmin(who: Auth) {
  env.ADMIN_EMAILS.push(who.user.email.toLowerCase());
}

/** The test admin's authenticator secret: the first sign-in sets it up, later ones reuse it. */
export const ADMIN_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

/**
 * Signs in as the admin with moderation open. Codes work once and tests sign in faster than one per 30 seconds,
 * so the last spent step is forgotten first.
 */
export async function asAdmin(app: FastifyInstance): Promise<Auth> {
  const boss: Auth = (await loginAs(app, "the-admin")).json();
  await prisma.user.update({ where: { id: boss.user.id }, data: { totpStep: null } });
  const res = await app.inject({
    method: "POST",
    url: "/v1/admin/2fa",
    headers: bearer(boss.accessToken),
    payload: { code: totp(ADMIN_SECRET, totpStep()), secret: ADMIN_SECRET },
  });
  if (res.statusCode !== 200) throw new Error(`Admin code refused: ${res.body}`);
  return boss;
}

export function chatHelpers(ctx: { app: FastifyInstance }) {
  const signUp = async (name: string, extra: Record<string, unknown> = {}): Promise<Auth> =>
    (await loginAs(ctx.app, uniqueSub(name), "ios", extra)).json();

  const get = async (who: Auth, url: string) =>
    (await ctx.app.inject({ url, headers: bearer(who.accessToken) })).json();

  const call = (who: Auth, method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) =>
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
