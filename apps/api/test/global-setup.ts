import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { TestProject } from "vitest/node";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://six:six@localhost:5432/six?schema=test";

export default async function setup(project: TestProject) {
  Object.assign(process.env, project.config.env);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: TEST_DB } });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DB }) });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'test' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `test."${t.tablename}"`).join(", ")} CASCADE`);
  }
  await db.$disconnect();
  const { ensureBucket } = await import("../src/lib/storage.js");
  await ensureBucket();
}
