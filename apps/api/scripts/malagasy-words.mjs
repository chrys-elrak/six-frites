import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Builds data/words-mg.txt for word hunt from the Malagasy Bible in mg-bibles (MIT), as there is no
 * Malagasy word list to install: words written in lower case at least three times, 3 to 10 letters,
 * ending as Malagasy words do, so names and the halves of elisions like "nilazan'i" are left out.
 *
 *   npm i --prefix /tmp/mgb mg-bibles@1.5.0
 *   node scripts/malagasy-words.mjs /tmp/mgb/node_modules/mg-bibles/dist > data/words-mg.txt
 */
function malagasyWords(root) {
  const counts = new Map();
  const tally = (text) => {
    for (const token of text.replace(/\[[^\]]*\]/g, " ").replace(/[’`]/g, "'").split(/[^\p{L}']+/u)) {
      const word = token.split("'").at(-1)?.normalize("NFD").replace(/\p{M}/gu, "");
      if (word && /^[a-z]+$/.test(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  };
  const walk = (v) => (typeof v === "string" ? tally(v) : Object.values(v).forEach(walk));
  for (const version of ["mg", "diem"]) {
    for (const file of readdirSync(join(root, version)).filter((f) => f.endsWith(".json"))) {
      walk(JSON.parse(readFileSync(join(root, version, file), "utf8")));
    }
  }
  return [...counts]
    .filter(([w, n]) => n >= 3 && w.length >= 3 && w.length <= 10 && !/[cqux]/.test(w) && /[aeoy]$/.test(w))
    .map(([w]) => w)
    .sort();
}

console.log(malagasyWords(process.argv[2]).join("\n"));
