import type { AddressInfo } from "node:net";
import { buildApp } from "../src/app.js";
import { createSocketServer } from "../src/socket/index.js";

/* Another API instance for the tests, as production runs two: its own memory, the same database and Redis. */
const app = await buildApp();
createSocketServer(app.server);
await app.listen({ port: 0, host: "127.0.0.1" });
console.log(`listening ${(app.server.address() as AddressInfo).port}`);
