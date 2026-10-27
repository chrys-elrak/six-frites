import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  QUEUE_PREFIX: z.string().default("six"),
  GOOGLE_CLIENT_IDS: z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  JWT_SECRET: z.string().min(32),
  BACKUP_PIN_SECRET: z.string().min(32),
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().default("mailto:admin@example.com"),
  FCM_SERVICE_ACCOUNT: z.string().optional(),
  GIPHY_API_KEY: z.string().optional(),
  KLIPY_API_KEY: z.string().optional(),
  STUN_URLS: z
    .string()
    .default("stun:stun.l.google.com:19302")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  TURN_URLS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  TURN_SECRET: z.string().optional(),
  STORE_URL: z.string().url().default("https://store.koera.mg"),
  STORE_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)),
});

export const env = Env.parse(process.env);
export const isProd = env.NODE_ENV === "production";
