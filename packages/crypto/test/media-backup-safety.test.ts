import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  CryptoError,
  MEDIA_CHUNK,
  b64,
  backupKeyId,
  decryptMedia,
  decryptMediaChunk,
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
  sealedChunkStart,
  sealBackup,
  unpad,
  unwrapBackupKey,
  utf8,
  wrapBackupKey,
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

  it("decrypts any chunk on its own for streaming, but only at its own index and finality", () => {
    const plain = randomBytes(3 * MEDIA_CHUNK + 5);
    const { data, key } = encryptMedia(plain);
    const prefix = data.subarray(0, 16);
    const chunk = (i: number) => data.subarray(sealedChunkStart(i), sealedChunkStart(i + 1));

    expect(decryptMediaChunk(key, prefix, 1, false, chunk(1))).toEqual(plain.subarray(MEDIA_CHUNK, 2 * MEDIA_CHUNK));
    expect(decryptMediaChunk(key, prefix, 3, true, chunk(3))).toEqual(plain.subarray(3 * MEDIA_CHUNK));
    expect(code(() => decryptMediaChunk(key, prefix, 2, false, chunk(1)))).toBe("BAD_MEDIA");
    expect(code(() => decryptMediaChunk(key, prefix, 1, true, chunk(1)))).toBe("BAD_MEDIA");
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

  it("wraps the backup key under a PIN and the server's secret", () => {
    const key = deriveBackupKey(random(32));
    const secret = b64(random(32));
    const wrapped = wrapBackupKey(key, "123456", secret);
    expect(unwrapBackupKey(wrapped, "123456", secret)).toEqual(key);
    expect(code(() => unwrapBackupKey(wrapped, "123457", secret))).toBe("BAD_RECOVERY_KEY");
    expect(code(() => unwrapBackupKey(wrapped, "123456", b64(random(32))))).toBe("BAD_RECOVERY_KEY");
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
  it("match on both sides, ignore device order and change when a device changes", () => {
    const id = () => publicIdentity(generateIdentity());
    const [phone, laptop] = [id(), id()];
    const alice = { identities: [phone, laptop], userId: "alice" };
    const bob = { identities: [id()], userId: "bob" };
    const number = safetyNumber(alice, bob);
    expect(number).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(safetyNumber(bob, alice)).toBe(number);
    expect(safetyNumber({ identities: [laptop, phone], userId: "alice" }, bob)).toBe(number);
    expect(safetyNumber(alice, { identities: [id()], userId: "bob" })).not.toBe(number);
    expect(safetyNumber({ identities: [phone], userId: "alice" }, bob)).not.toBe(number);
  });
});
