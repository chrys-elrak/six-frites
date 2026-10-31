import { z } from "zod";
import { Id, IsoDate } from "./common.js";
import { ContactPhoto } from "./contacts.js";

export const ASK_MAX = 500;

/** The header gradients a shared message card can wear, first one by default. */
export const ASK_COLORS = [
  ["#f59e0b", "#e11d48"],
  ["#ec4899", "#f97316"],
  ["#8b5cf6", "#ec4899"],
  ["#3b82f6", "#06b6d4"],
  ["#10b981", "#84cc16"],
  ["#f43f5e", "#be123c"],
  ["#1c1917", "#57534e"],
] as const;
export type AskColors = (typeof ASK_COLORS)[number];

export const AskProfileDTO = z.object({
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
});
export type AskProfileDTO = z.infer<typeof AskProfileDTO>;

export const UpdateAskProfileInput = z.object({
  name: z.string().trim().max(64).optional().describe("Shown on your link; empty goes back to your account name"),
  photo: ContactPhoto.nullable().optional().describe("A base64 JPEG, PNG or WebP data URL of at most 64 KB; null removes it"),
});
export type UpdateAskProfileInput = z.infer<typeof UpdateAskProfileInput>;

export const SendAnonInput = z.object({ text: z.string().trim().min(1).max(ASK_MAX) });
export type SendAnonInput = z.infer<typeof SendAnonInput>;

export const AnonMessageDTO = z.object({ id: Id, text: z.string(), createdAt: IsoDate });
export type AnonMessageDTO = z.infer<typeof AnonMessageDTO>;

/** The link people open to send you anonymous messages, on the web app at `origin`. */
export const askUrl = (origin: string, code: string) => `${origin}/ask/${code}`;
