import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8 } from "./bytes.js";
import { type PublicIdentity, identityBytes } from "./keys.js";

const ITERATIONS = 5200;
const VERSION = Uint8Array.of(0, 0);

const compare = (a: Uint8Array, b: Uint8Array) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
};

/**
 * 30 digits identifying one person's identity keys, computed the way Signal's safety numbers are.
 * Each device has its own identity, so all of them are hashed together, in a fixed order; adding or
 * replacing a device changes the number.
 */
function fingerprint(identities: PublicIdentity[], userId: string) {
  const key = concatBytes(...identities.map(identityBytes).sort(compare));
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
  mine: { identities: PublicIdentity[]; userId: string },
  theirs: { identities: PublicIdentity[]; userId: string },
) {
  const parts = [fingerprint(mine.identities, mine.userId), fingerprint(theirs.identities, theirs.userId)].sort();
  return (parts[0]! + parts[1]!).match(/.{5}/g)!.join(" ");
}
