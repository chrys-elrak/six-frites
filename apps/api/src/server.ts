import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { createSocketServer } from "./socket/index.js";

const app = await buildApp();
const io = createSocketServer(app.server);

await app.listen({ port: env.PORT, host: "0.0.0.0" });

const shutdown = async () => {
  io.close();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
