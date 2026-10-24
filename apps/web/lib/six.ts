import { createSixClient } from "@six/sdk";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const six = createSixClient({ baseUrl: API_URL, platform: "web" });
