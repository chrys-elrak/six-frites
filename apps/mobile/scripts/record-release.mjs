#!/usr/bin/env -S npx tsx
/**
 * Called by the release build scripts once a build succeeds: `record-release.mjs <what was built> [artifact]`.
 * Adds the build to RELEASES.md under its version, creating the version's section with its en/fr/mg notes from
 * packages/shared/src/changelog.ts the first time that version is built.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { CHANGELOG } from "../../../packages/shared/src/changelog.ts";

const [what, artifact] = process.argv.slice(2);
const config = readFileSync("app.config.ts", "utf8");
const version = config.match(/^ {2}version: "(.+)",$/m)[1];
const build = what.startsWith("iOS") ? `build ${config.match(/buildNumber: "(\d+)"/)[1]}` : `versionCode ${config.match(/versionCode: (\d+)/)[1]}`;
const release = CHANGELOG.find((r) => r.version === version);

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const commit = sh("git rev-parse --short HEAD") + (sh("git status --porcelain") ? " + uncommitted changes" : "");
const when = sh('date "+%Y-%m-%d %Hh%M"');
const file = artifact && existsSync(artifact) && statSync(artifact).isFile() ? artifact : null;
const hash = file ? ` · sha256 \`${createHash("sha256").update(readFileSync(file)).digest("hex")}\`` : "";
const line = `- ${when} · ${what} · ${build}${artifact ? ` · \`${artifact}\`` : ""}${hash} · commit ${commit}`;

const path = "RELEASES.md";
const intro = "# Releases\n\nEvery production build of the Android and iOS app, newest version first. The build scripts add to it through\nscripts/record-release.mjs; the notes come from packages/shared/src/changelog.ts.\n";
let doc = existsSync(path) ? readFileSync(path, "utf8") : intro;
const heading = `## ${version}\n`;
if (doc.includes(heading)) {
  doc = doc.replace(`${heading}\n### Builds\n`, `${heading}\n### Builds\n${line}\n`);
} else {
  const notes = Object.entries(release.notes).map(([locale, list]) => `### ${locale}\n${list.map((n) => `- ${n}`).join("\n")}\n`).join("\n");
  const section = `${heading}\n### Builds\n${line}\n\n${notes}\n`;
  const first = doc.indexOf("\n## ");
  doc = first === -1 ? `${doc}\n${section}` : `${doc.slice(0, first + 1)}${section}${doc.slice(first + 1)}`;
}
writeFileSync(path, doc);
console.log(`Recorded in apps/mobile/RELEASES.md: ${line}`);
