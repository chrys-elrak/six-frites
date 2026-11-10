import { SixApiError, createSixClient } from "@six/sdk";
import { create } from "zustand";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Set when an upload is refused because the account's storage is full, so the app can say what to do. */
export const useStorageFull = create<{ open: boolean }>(() => ({ open: false }));

const client = createSixClient({ baseUrl: API_URL, platform: "web" });

export const six = {
  ...client,
  upload: (...args: Parameters<typeof client.upload>) =>
    client.upload(...args).catch((err: unknown) => {
      if (err instanceof SixApiError && err.code === "STORAGE_FULL") useStorageFull.setState({ open: true });
      throw err;
    }),
};
