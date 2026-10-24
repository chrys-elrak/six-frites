import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  GOOGLE_CLIENT_IDS: z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  JWT_SECRET: z.string().min(32),
});

export const env = Env.parse(process.env);
export const isProd = env.NODE_ENV === "production";
