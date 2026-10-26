import { createHmac } from "node:crypto";
import { AppError, type CallSignalInput, type IceServersDTO, type LogCallInput, type MessageDTO } from "@six/shared";
import { env } from "../env.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { assertCanMessage } from "./blocks.js";
import { activeDevices } from "./devices.js";
import { assertMember, createMessage, messageInclude, toMessageDTO } from "./messages.js";

const CREDENTIAL_SECONDS = 12 * 60 * 60;

/**
 * STUN and TURN servers for WebRTC. TURN credentials are coturn's time-limited ones
 * (use-auth-secret): the username carries the expiry and the password is its HMAC.
 */
export function iceServers(userId: string): IceServersDTO {
  const servers: IceServersDTO["iceServers"] = env.STUN_URLS.length ? [{ urls: env.STUN_URLS }] : [];
  if (env.TURN_URLS.length && env.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_SECONDS}:${userId}`;
    const credential = createHmac("sha1", env.TURN_SECRET).update(username).digest("base64");
    servers.push({ urls: env.TURN_URLS, username, credential });
  }
  return { iceServers: servers, ttlSeconds: CREDENTIAL_SECONDS / 2 };
}

/**
 * Passes encrypted call signalling from one device to others in the same chat, straight to their
 * sockets. Nothing is stored; envelopes for devices that are not members' are dropped.
 */
export async function relaySignal(userId: string, sessionId: string, input: CallSignalInput) {
  const sender = await prisma.device.findUnique({ where: { sessionId } });
  if (!sender) throw new AppError("DEVICE_NOT_REGISTERED");
  await assertMember(prisma, input.chatId, userId);
  await assertCanMessage(prisma, input.chatId, userId);
  const members = await prisma.chatMember.findMany({ where: { chatId: input.chatId }, select: { userId: true } });
  const devices = new Map((await activeDevices(prisma, members.map((m) => m.userId))).map((d) => [d.id, d]));

  let delivered = 0;
  const out = broadcaster();
  for (const { deviceId, envelope } of input.envelopes) {
    const target = devices.get(deviceId);
    if (!target || target.id === sender.id) continue;
    out.to(rooms.session(target.sessionId)).emit("call:signal", {
      chatId: input.chatId,
      callId: input.callId,
      fromUserId: userId,
      fromDeviceId: sender.id,
      envelope,
    });
    delivered++;
  }
  return { delivered };
}

/** Records a finished or missed call in the chat. Idempotent per call. */
export async function logCall(userId: string, chatId: string, input: LogCallInput): Promise<MessageDTO> {
  const clientId = `call:${input.callId}`;
  const find = () =>
    prisma.message.findUnique({ where: { senderId_clientId: { senderId: userId, clientId } }, include: messageInclude });
  const existing = await find();
  if (existing) return toMessageDTO(existing, userId);
  try {
    const { message } = await withEvents((tx, emit) =>
      createMessage(tx, emit, userId, chatId, {
        clientId,
        action: { type: "call", video: input.video, secs: input.durationSecs },
      }),
    );
    return toMessageDTO(message, userId);
  } catch (err) {
    const raced = (err as { code?: string }).code === "P2002" ? await find() : null;
    if (!raced) throw err;
    return toMessageDTO(raced, userId);
  }
}
