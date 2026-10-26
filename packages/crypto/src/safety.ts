import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8 } from "./bytes.js";
import { type PublicIdentity, identityBytes } from "./keys.js";

const ITERATIONS = 5200;
const VERSION = Uint8Array.of(0, 0);

/** 30 digits identifying one person's identity key, computed the way Signal's safety numbers are. */
function fingerprint(identity: PublicIdentity, userId: string) {
  const key = identityBytes(identity);
  let hash = sha512(concatBytes(VERSION, key, utf8(userId)));
  for (let i = 1; i < ITERATIONS; i++) hash = sha512(concatBytes(hash, key));
  let digits = "";
  for (let i = 0; i < 30; i += 5) {
    const chunk = hash.subarray(i, i + 5).reduce((n, b) => n * 256 + b, 0);
    digits += String(chunk % 100000).padStart(5, "0");
  }
  return digits;
}

/**
 * The 60-digit number two people compare to check nobody is in the middle. Both sides get the same
 * digits because the two halves are sorted. Shown as 12 groups of 5.
 */
export function safetyNumber(
  mine: { identity: PublicIdentity; userId: string },
  theirs: { identity: PublicIdentity; userId: string },
) {
  const parts = [fingerprint(mine.identity, mine.userId), fingerprint(theirs.identity, theirs.userId)].sort();
  return (parts[0]! + parts[1]!).match(/.{5}/g)!.join(" ");
}
