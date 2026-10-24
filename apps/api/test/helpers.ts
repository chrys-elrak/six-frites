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
