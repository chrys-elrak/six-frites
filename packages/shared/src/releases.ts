import { z } from "zod";
import { IsoDate } from "./common.js";

export const LatestAppDTO = z.object({
  version: z.string(),
  notes: z.string().nullable(),
  size: z.number().int(),
  publishedAt: IsoDate,
  downloadUrl: z.string().url().describe("Stable link that always gets the newest version"),
});
export type LatestAppDTO = z.infer<typeof LatestAppDTO>;

/** Whether dotted version `a` (such as 1.10.0) comes after `b`. */
export function isNewerVersion(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
