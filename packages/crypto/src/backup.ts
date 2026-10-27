import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { CryptoError, b64, concatBytes, fromB64, pad, randomBytes, unpad, utf8 } from "./bytes.js";

const BACKUP_INFO = utf8("SixFrites_Backup_v1");
const BACKUP_ID_INFO = utf8("SixFrites_BackupId_v1");

/** A new recovery key: 32 random bytes, shown to the user once as 24 words. */
export function generateRecoveryKey() {
  const entropy = randomBytes(32);
  return { entropy, words: entropyToMnemonic(entropy, wordlist) };
}

/** Accepts the 24 words in any case or spacing; throws if they are mistyped. */
export function recoveryKeyFromWords(words: string) {
  const normalised = words.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(normalised, wordlist)) {
    throw new CryptoError("BAD_RECOVERY_KEY", "Those words are not a valid recovery key");
  }
  return mnemonicToEntropy(normalised, wordlist);
}

/** The symmetric key every message is also sealed to, so a new device can restore history. */
export const deriveBackupKey = (recovery: Uint8Array) => hkdf(sha256, recovery, new Uint8Array(32), BACKUP_INFO, 32);

/**
 * A public fingerprint of the backup key, stored by the server so a client can tell which recovery
 * key its backup belongs to without the server learning anything usable.
 */
export const backupKeyId = (backupKey: Uint8Array) =>
  b64(hkdf(sha256, backupKey, new Uint8Array(32), BACKUP_ID_INFO, 16));

/** Seals a message for the backup. `ad` should name what it belongs to, such as the message's client id. */
export function sealBackup(backupKey: Uint8Array, plaintext: Uint8Array, ad: Uint8Array) {
  const nonce = randomBytes(24);
  return b64(concatBytes(nonce, xchacha20poly1305(backupKey, nonce, ad).encrypt(pad(plaintext))));
}

export function openBackup(backupKey: Uint8Array, sealed: string, ad: Uint8Array) {
  const bytes = fromB64(sealed);
  try {
    return unpad(xchacha20poly1305(backupKey, bytes.subarray(0, 24), ad).decrypt(bytes.subarray(24)));
  } catch {
    throw new CryptoError("DECRYPT_FAILED", "Backup entry could not be decrypted with this recovery key");
  }
}

const PIN_INFO = utf8("SixFrites_BackupPin_v1");

const pinKey = (pin: string, serverSecret: string) =>
  hkdf(sha256, concatBytes(fromB64(serverSecret), utf8(pin)), new Uint8Array(32), PIN_INFO, 32);

/**
 * Seals the backup key under a short PIN mixed with a secret the server derives and never stores.
 * The server hands the sealed key back only after checking the PIN, with a few tries at most, so
 * someone holding just the database can't guess the PIN offline.
 */
export function wrapBackupKey(backupKey: Uint8Array, pin: string, serverSecret: string) {
  const nonce = randomBytes(24);
  return b64(concatBytes(nonce, xchacha20poly1305(pinKey(pin, serverSecret), nonce).encrypt(backupKey)));
}

export function unwrapBackupKey(wrapped: string, pin: string, serverSecret: string) {
  const bytes = fromB64(wrapped);
  try {
    return xchacha20poly1305(pinKey(pin, serverSecret), bytes.subarray(0, 24)).decrypt(bytes.subarray(24));
  } catch {
    throw new CryptoError("BAD_RECOVERY_KEY", "That PIN does not open this backup");
  }
}
