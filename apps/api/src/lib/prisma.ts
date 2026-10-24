import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const schema = new URL(env.DATABASE_URL).searchParams.get("schema") ?? undefined;
const adapter = new PrismaPg(
  { connectionString: env.DATABASE_URL, options: schema && `-c search_path=${schema}` },
  { schema },
);

export const prisma = new PrismaClient({ adapter });
