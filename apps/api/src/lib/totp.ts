import { createHmac, randomBytes } from "node:crypto";
import { env } from "../env.js";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

const toBase32 = (bytes: Buffer) =>
  [...bytes]
    .map((b) => b.toString(2).padStart(8, "0"))
    .join("")
    .match(/.{1,5}/g)!
    .map((bits) => BASE32[parseInt(bits.padEnd(5, "0"), 2)])
    .join("");

const fromBase32 = (text: string) =>
  Buffer.from(
    [...text]
      .map((c) => BASE32.indexOf(c).toString(2).padStart(5, "0"))
      .join("")
      .match(/.{8}/g)!
      .map((bits) => parseInt(bits, 2)),
  );

/** A new 160-bit secret, as the 32 base32 letters authenticator apps take. */
export const newTotpSecret = () => toBase32(randomBytes(20));

/** The 6-digit code for one 30-second step (RFC 6238, SHA-1, as every authenticator app does it). */
export function totp(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/** The step `code` was made for, allowing a phone clock 30 seconds off either way, or null when it matches none. */
export function matchTotp(secret: string, code: string, now = Date.now()) {
  const step = totpStep(now);
  return [step - 1, step, step + 1].find((s) => totp(secret, s) === code) ?? null;
}

/** The authenticator entry reads "Six Frites (host): email", so prod and dev entries can be told apart. */
export function totpUri(secret: string, account: string) {
  const issuer = encodeURIComponent(`Six Frites (${new URL(env.WEB_ORIGIN.split(",")[0]!).host})`);
  return `otpauth://totp/${issuer}:${encodeURIComponent(account)}?secret=${secret}&issuer=${issuer}`;
}
