import type { AddressInfo } from "node:net";
import { E2EE, type SecretStore, type paths } from "@six/sdk";
import type { CallSignalDTO } from "@six/shared";
import createClient from "openapi-fetch";
import { type Socket, io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSocketServer } from "../src/socket/index.js";
import { type Auth, chatHelpers, loginAs, uniqueSub, useApp } from "./helpers.js";

const ctx = useApp();
const { get, call } = chatHelpers(ctx);

class MemoryStore implements SecretStore {
  data = new Map<string, string>();
  get = async (k: string) => this.data.get(k) ?? null;
  set = async (k: string, v: string) => void this.data.set(k, v);
  delete = async (k: string) => void this.data.delete(k);
  clear = async () => this.data.clear();
}

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

let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  createSocketServer(ctx.app.server);
  await ctx.app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(() => sockets.forEach((s) => s.disconnect()));

interface Phone {
  auth: Auth;
  e2ee: E2EE;
  socket: Socket;
  signals: CallSignalDTO[];
}

async function phone(auth: Auth): Promise<Phone> {
  const e2ee = new E2EE(restFor(auth), new MemoryStore(), auth.user.id);
  await e2ee.ready();
  const socket = connect(url, { auth: { token: auth.accessToken }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const signals: CallSignalDTO[] = [];
  socket.on("call:signal", (s: CallSignalDTO) => signals.push(s));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return { auth, e2ee, socket, signals };
}

async function next(p: Phone) {
  for (let i = 0; i < 50 && !p.signals.length; i++) await new Promise((r) => setTimeout(r, 20));
  const s = p.signals.shift();
  if (!s) throw new Error("no signal arrived");
  return s;
}

async function setup() {
  const caller = await phone((await loginAs(ctx.app, uniqueSub("caller"))).json());
  const invite = await call(caller.auth, "POST", "/v1/invites", {});
  const sub = uniqueSub("callee");
  const callee = await phone((await loginAs(ctx.app, sub, "ios", { inviteCode: invite.json().code })).json());
  const laptop = await phone((await loginAs(ctx.app, sub)).json());
  const chatId = (await get(caller.auth, "/v1/contacts")).items[0].chatId as string;
  return { caller, callee, laptop, chatId, members: [caller.auth.user.id, callee.auth.user.id] };
}

describe("calls", () => {
  it("rings every device of the callee and tells the others when one answers", async () => {
    const { caller, callee, laptop, chatId, members } = await setup();
    const callId = "call-0001";

    const offer = await caller.e2ee.sealSignal(chatId, members, callId, { type: "offer", sdp: "v=0 offer", video: true });
    const sent = await caller.socket.emitWithAck("call:signal", { chatId, callId, envelopes: offer });
    expect(sent).toEqual({ ok: true, data: { delivered: 2 } });

    for (const device of [callee, laptop]) {
      const dto = await next(device);
      expect(dto).toMatchObject({ chatId, callId, fromUserId: caller.auth.user.id });
      expect(await device.e2ee.openSignal(dto)).toMatchObject({ type: "offer", sdp: "v=0 offer", video: true });
    }

    const answer = await callee.e2ee.sealSignal(chatId, members, callId, { type: "answer", sdp: "v=0 answer" });
    await callee.socket.emitWithAck("call:signal", { chatId, callId, envelopes: answer });
    expect(await caller.e2ee.openSignal(await next(caller))).toMatchObject({ type: "answer", sdp: "v=0 answer" });
    const elsewhere = await laptop.e2ee.openSignal(await next(laptop));
    expect(elsewhere).toMatchObject({ type: "answer" });

    const ice = await caller.e2ee.sealSignal(chatId, members, callId, {
      type: "ice",
      candidate: { candidate: "candidate:1 1 udp 1 10.0.0.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    });
    await caller.socket.emitWithAck("call:signal", { chatId, callId, envelopes: ice });
    expect(await callee.e2ee.openSignal(await next(callee))).toMatchObject({ type: "ice" });
  });

  it("ignores a signal moved to another call", async () => {
    const { caller, callee, chatId, members } = await setup();
    const offer = await caller.e2ee.sealSignal(chatId, members, "call-real", { type: "offer", sdp: "x", video: false });
    await caller.socket.emitWithAck("call:signal", { chatId, callId: "call-fake", envelopes: offer });
    expect(await callee.e2ee.openSignal(await next(callee))).toBeNull();
  });

  it("does not relay calls between blocked people", async () => {
    const { caller, callee, chatId, members } = await setup();
    await call(callee.auth, "POST", `/v1/users/${caller.auth.user.id}/block`);
    const offer = await caller.e2ee.sealSignal(chatId, members, "call-blocked", { type: "offer", sdp: "x", video: false });
    const res = await caller.socket.emitWithAck("call:signal", { chatId, callId: "call-blocked", envelopes: offer });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("CHAT_BLOCKED");
  });

  it("hands out ICE servers and logs calls once", async () => {
    const { caller, callee, chatId } = await setup();
    const ice = await get(caller.auth, "/v1/calls/ice-servers");
    expect(ice.iceServers[0].urls.length).toBeGreaterThan(0);

    const body = { callId: "call-logged", video: false, durationSecs: 151 };
    const first = await call(caller.auth, "POST", `/v1/chats/${chatId}/calls`, body);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ type: "service", action: { type: "call", video: false, secs: 151 } });
    expect((await call(caller.auth, "POST", `/v1/chats/${chatId}/calls`, body)).json().id).toBe(first.json().id);
    const seen = (await get(callee.auth, `/v1/chats/${chatId}/messages`)).items[0];
    expect(seen.action).toEqual({ type: "call", video: false, secs: 151 });
  });
});
