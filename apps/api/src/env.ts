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
  /** The APNs auth key (.p8) for iOS push, newlines written as \n; iPhones get no notifications without it. */
  APNS_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().default("BDJ7N2QQ43"),
  APNS_TOPIC: z.string().default("com.sixfrites.app"),
  /** The Firebase project whose ID tokens sign people in, the same one the web app signs in with. */
  FIREBASE_PROJECT_ID: z.string().default("akondro"),
  GIPHY_API_KEY: z.string().optional(),
  KLIPY_API_KEY: z.string().optional(),
  /** Place search goes to Google with it, to OpenStreetMap without. */
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  /** Each person's monthly share of what Google bills, so the app stays within Google's free amounts. */
  PLACE_SEARCHES_PER_MONTH: z.coerce.number().int().min(0).default(50),
  PLACE_SUGGESTIONS_PER_MONTH: z.coerce.number().int().min(0).default(100),
  MAP_PREVIEWS_PER_MONTH: z.coerce.number().int().min(0).default(100),
  MAP_PICKERS_PER_MONTH: z.coerce.number().int().min(0).default(30),
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
  /** "true" lets admins in without an authenticator code; ignored in production. */
  ADMIN_SKIP_2FA: z.enum(["true", "false"]).default("false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM_NAME: z.string().default("Six Frites"),
  /** Outside production every email goes here instead, and none is sent without it. */
  MAIL_REDIRECT_TO: z.string().email().optional(),
  /** Where emails load the logo from; defaults to the web app. */
  MAIL_ASSETS_URL: z.string().url().optional(),
  INVITE_ONLY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** New sign-ups are refused once this many accounts exist; admins always get in. */
  MAX_USERS: z.coerce.number().int().default(100),
});

export const env = Env.parse(process.env);
export const isProd = env.NODE_ENV === "production";
