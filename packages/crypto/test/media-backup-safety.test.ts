import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  CryptoError,
  MEDIA_CHUNK,
  backupKeyId,
  decryptMedia,
  deriveBackupKey,
  encryptMedia,
  fromUtf8,
  generateIdentity,
  generateRecoveryKey,
  openBackup,
  pad,
  publicIdentity,
  randomBytes as random,
  recoveryKeyFromWords,
  safetyNumber,
  sealBackup,
  unpad,
  utf8,
} from "../src/index.js";

const randomBytes = (n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) out.set(random(Math.min(65536, n - i)), i);
  return out;
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof CryptoError ? err.code : String(err);
  }
  return "no error";
};

describe("media", () => {
  it.each([0, 1, MEDIA_CHUNK - 1, MEDIA_CHUNK, MEDIA_CHUNK + 1, 3 * MEDIA_CHUNK + 17])(
    "round-trips %i bytes",
    (size) => {
      const plain = randomBytes(size);
      const { data, key, digest } = encryptMedia(plain);
      expect(data.length).toBeGreaterThan(size);
      expect(decryptMedia(data, key, digest)).toEqual(plain);
    },
  );

  it("detects truncation, reordering and the wrong key", () => {
    const plain = randomBytes(3 * MEDIA_CHUNK + 5);
    const { data, key, digest } = encryptMedia(plain);
    const sealed = MEDIA_CHUNK + 16;

    const truncated = data.slice(0, 16 + 2 * sealed);
    expect(code(() => decryptMedia(truncated, key, digest))).toBe("BAD_MEDIA");

    const swapped = data.slice();
    swapped.set(data.subarray(16, 16 + sealed), 16 + sealed);
    swapped.set(data.subarray(16 + sealed, 16 + 2 * sealed), 16);
    expect(code(() => decryptMedia(swapped, key, digest))).toBe("BAD_MEDIA");

    expect(code(() => decryptMedia(data, randomBytes(32), digest))).toBe("BAD_MEDIA");
  });

  it("rejects a truncated file even when its digest matches, because the last chunk must be final", () => {
    const { data, key } = encryptMedia(randomBytes(2 * MEDIA_CHUNK + 1));
    const cut = data.slice(0, 16 + MEDIA_CHUNK + 16);
    expect(code(() => decryptMedia(cut, key, sha256(cut)))).toBe("BAD_MEDIA");
  });
});

describe("backup", () => {
  it("round-trips through the 24 words", () => {
    const { entropy, words } = generateRecoveryKey();
    expect(words.split(" ")).toHaveLength(24);
    expect(recoveryKeyFromWords(`  ${words.toUpperCase().replace(/ /g, "   ")} `)).toEqual(entropy);
  });

  it("rejects mistyped words", () => {
    const { words } = generateRecoveryKey();
    const list = words.split(" ");
    list[3] = list[3] === "abandon" ? "ability" : "abandon";
    expect(code(() => recoveryKeyFromWords(list.join(" ")))).toBe("BAD_RECOVERY_KEY");
  });

  it("seals and opens backup entries, bound to their label", () => {
    const key = deriveBackupKey(generateRecoveryKey().entropy);
    const sealed = sealBackup(key, utf8("message content"), utf8("client-1"));
    expect(fromUtf8(openBackup(key, sealed, utf8("client-1")))).toBe("message content");
    expect(code(() => openBackup(key, sealed, utf8("client-2")))).toBe("DECRYPT_FAILED");
    const other = deriveBackupKey(generateRecoveryKey().entropy);
    expect(code(() => openBackup(other, sealed, utf8("client-1")))).toBe("DECRYPT_FAILED");
  });

  it("gives the same id for the same key and different ids otherwise", () => {
    const { entropy } = generateRecoveryKey();
    expect(backupKeyId(deriveBackupKey(entropy))).toBe(backupKeyId(deriveBackupKey(entropy)));
    expect(backupKeyId(deriveBackupKey(entropy))).not.toBe(backupKeyId(deriveBackupKey(generateRecoveryKey().entropy)));
  });
});

describe("padding", () => {
  it("hides exact lengths and round-trips", () => {
    expect(pad(new Uint8Array(0)).length).toBe(64);
    expect(pad(new Uint8Array(63)).length).toBe(64);
    expect(pad(new Uint8Array(64)).length).toBe(128);
    const data = randomBytes(100);
    expect(unpad(pad(data))).toEqual(data);
  });
});

describe("safety numbers", () => {
  it("match on both sides and change when an identity changes", () => {
    const alice = { identity: publicIdentity(generateIdentity()), userId: "alice" };
    const bob = { identity: publicIdentity(generateIdentity()), userId: "bob" };
    const number = safetyNumber(alice, bob);
    expect(number).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(safetyNumber(bob, alice)).toBe(number);
    const bob2 = { identity: publicIdentity(generateIdentity()), userId: "bob" };
    expect(safetyNumber(alice, bob2)).not.toBe(number);
  });
});
