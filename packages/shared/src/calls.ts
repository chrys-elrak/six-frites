import { z } from "zod";
import { Id } from "./common.js";
import { DeviceEnvelope, EnvelopeJSON } from "./e2ee.js";

const CallId = z.string().min(8).max(64);

/** Relays call signalling to the other person's devices (and your own, so they stop ringing). */
export const CallSignalInput = z.object({
  chatId: Id,
  callId: CallId,
  envelopes: z.array(DeviceEnvelope).min(1).max(50).describe("The signal sealed for each device"),
});
export type CallSignalInput = z.infer<typeof CallSignalInput>;

/** One signal as delivered to one device. Nothing is stored: devices that are offline miss it. */
export const CallSignalDTO = z.object({
  chatId: Id,
  callId: CallId,
  fromUserId: Id,
  fromDeviceId: Id,
  envelope: EnvelopeJSON,
});
export type CallSignalDTO = z.infer<typeof CallSignalDTO>;

const IceCandidate = z.object({
  candidate: z.string().max(2000),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
});

/**
 * What a signal says, inside its envelope. `chatId` and `callId` bind it to one call. `offer`
 * rings; `answer` picks up (other devices of the callee then stop ringing on `answered`);
 * `ice` trickles connection candidates; `reject`, `busy` and `hangup` end it.
 */
export const CallSignal = z
  .object({
    v: z.literal(1),
    kind: z.literal("call"),
    chatId: Id,
    callId: CallId,
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("offer"), sdp: z.string().max(20_000), video: z.boolean() }),
      z.object({ type: z.literal("answer"), sdp: z.string().max(20_000) }),
      z.object({ type: z.literal("ice"), candidate: IceCandidate }),
      z.object({ type: z.literal("ringing") }),
      z.object({ type: z.literal("answered") }),
      z.object({ type: z.literal("reject") }),
      z.object({ type: z.literal("busy") }),
      z.object({ type: z.literal("hangup") }),
      z.object({ type: z.literal("video"), on: z.boolean() }),
    ]),
  );
export type CallSignal = z.infer<typeof CallSignal>;

export const IceServersDTO = z.object({
  iceServers: z.array(
    z.object({
      urls: z.array(z.string()),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
  ttlSeconds: z.number().int().describe("Fetch new credentials after this long"),
});
export type IceServersDTO = z.infer<typeof IceServersDTO>;

export const LogCallInput = z.object({
  callId: CallId,
  video: z.boolean(),
  durationSecs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60)
    .nullable()
    .describe("How long it lasted once answered; null when nobody picked up"),
});
export type LogCallInput = z.infer<typeof LogCallInput>;
