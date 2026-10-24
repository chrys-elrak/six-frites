import { writeFile } from "node:fs/promises";
import { buildApp } from "../app.js";

const app = await buildApp();
await app.ready();
const out = process.argv[2] ?? "openapi.json";
await writeFile(out, JSON.stringify(app.swagger(), null, 2));
await app.close();
console.log(`wrote ${out}`);
process.exit(0);
