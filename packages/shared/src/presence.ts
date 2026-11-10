import { z } from "zod";
import { Id, IsoDate } from "./common.js";

export const CLIENT_DEVICES = ["app", "web", "desktop"] as const;
export const ClientDevice = z.enum(CLIENT_DEVICES);
export type ClientDevice = z.infer<typeof ClientDevice>;

export const PresenceDTO = z.object({
  userId: Id,
  online: z.boolean().describe("Has the app open on at least one device right now"),
  devices: z
    .array(ClientDevice)
    .describe("What they have it open on right now: the mobile app, a phone browser or a computer. Empty when offline"),
  lastSeenAt: IsoDate.nullable().describe("When they last had the app open; null if never recorded"),
});
export type PresenceDTO = z.infer<typeof PresenceDTO>;

export const PresenceQuery = z.object({
  ids: z
    .string()
    .max(4000)
    .describe("Comma-separated user ids, at most 100. Only people you share a chat with are returned.")
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
    .refine((ids) => ids.length >= 1 && ids.length <= 100, "Provide between 1 and 100 ids"),
});
export type PresenceQuery = z.infer<typeof PresenceQuery>;

export const PresenceList = z.object({ items: z.array(PresenceDTO) });
export type PresenceList = z.infer<typeof PresenceList>;
