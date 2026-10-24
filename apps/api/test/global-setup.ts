import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://six:six@localhost:5432/six?schema=test";

export default async function setup() {
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: TEST_DB } });
  const db = new PrismaClient({ datasourceUrl: TEST_DB });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'test' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `test."${t.tablename}"`).join(", ")} CASCADE`);
  }
  await db.$disconnect();
  process.env.S3_BUCKET = "six-test";
  const { ensureBucket } = await import("../src/lib/storage.js");
  await ensureBucket();
}
