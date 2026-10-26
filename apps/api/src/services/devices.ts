import { fromB64, publicIdentityFromJSON, verifyIdentity, verifySignedPreKey } from "@six/crypto";
import {
  type AddPreKeysInput,
  AppError,
  type DeviceDTO,
  type DeviceEnvelope,
  type MyDeviceDTO,
  PREKEYS,
  type PreKeyBundleDTO,
  type PublicIdentityJSON,
  type RegisterDeviceInput,
  type SignedPreKeyJSON,
} from "@six/shared";
import type { Device } from "../generated/prisma/client.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";

const identityOf = (d: Device): PublicIdentityJSON => ({ signPub: d.signPub, dhPub: d.dhPub, dhSig: d.dhSig });

function toDeviceDTO(d: Device): DeviceDTO {
  return { id: d.id, userId: d.userId, identity: identityOf(d), createdAt: d.createdAt.toISOString() };
}

function checkKeys(identity: PublicIdentityJSON, signedPreKey: SignedPreKeyJSON) {
  try {
    const id = publicIdentityFromJSON(identity);
    verifyIdentity(id);
    verifySignedPreKey(id, { id: signedPreKey.id, pub: fromB64(signedPreKey.pub), sig: fromB64(signedPreKey.sig) });
  } catch (err) {
    throw new AppError("BAD_KEY", err instanceof Error ? err.message : "Invalid keys");
  }
}

/** Devices that can receive messages: their session is still signed in. */
export const activeDevice = () => ({ session: { revokedAt: null, expiresAt: { gt: new Date() } } });

export async function activeDevices(db: Tx, userIds: string[]) {
  return db.device.findMany({ where: { userId: { in: userIds }, ...activeDevice() }, orderBy: { createdAt: "asc" } });
}

/** People who can see this user's devices: themselves and everyone they share a chat with. */
async function audienceOf(db: Tx, userId: string) {
  const chats = await db.chatMember.findMany({ where: { userId }, select: { chatId: true } });
  const members = await db.chatMember.findMany({
    where: { chatId: { in: chats.map((c) => c.chatId) } },
    select: { userId: true },
  });
  return new Set([userId, ...members.map((m) => m.userId)]);
}

async function announceDevices(db: Tx, emit: Emit, userId: string) {
  for (const id of await audienceOf(db, userId)) emit(id, "devices.changed", { userId });
}

async function myDevice(db: Tx, sessionId: string) {
  const device = await db.device.findUnique({ where: { sessionId } });
  if (!device) throw new AppError("DEVICE_NOT_REGISTERED", "Register this device's keys first");
  return device;
}

async function toMyDeviceDTO(db: Tx, d: Device): Promise<MyDeviceDTO> {
  return {
    ...toDeviceDTO(d),
    signedPreKeyId: d.signedPreKeyId,
    signedPreKeyAt: d.signedPreKeyAt.toISOString(),
    oneTimePreKeys: await db.oneTimePreKey.count({ where: { deviceId: d.id } }),
  };
}

export async function getMyDevice(sessionId: string) {
  return toMyDeviceDTO(prisma, await myDevice(prisma, sessionId));
}

/**
 * Publishes the keys of the device signed in with this session. Sending the same identity again
 * only refreshes its prekeys; a different identity (the app was reinstalled or lost its keys)
 * replaces the device, so people get a new device id and a key-change notice.
 */
export async function registerDevice(userId: string, sessionId: string, input: RegisterDeviceInput) {
  checkKeys(input.identity, input.signedPreKey);
  return withEvents(async (tx, emit) => {
    const existing = await tx.device.findUnique({ where: { sessionId } });
    const same =
      existing && existing.signPub === input.identity.signPub && existing.dhPub === input.identity.dhPub;
    const spk = {
      signedPreKeyId: input.signedPreKey.id,
      signedPreKey: input.signedPreKey.pub,
      signedPreKeySig: input.signedPreKey.sig,
    };

    let device: Device;
    if (same) {
      device =
        existing.signedPreKeyId === spk.signedPreKeyId && existing.signedPreKey === spk.signedPreKey
          ? existing
          : await tx.device.update({ where: { id: existing.id }, data: { ...spk, signedPreKeyAt: new Date() } });
    } else {
      if (existing) await tx.device.delete({ where: { id: existing.id } });
      device = await tx.device.create({ data: { userId, sessionId, ...input.identity, ...spk } });
      await announceDevices(tx, emit, userId);
    }
    await storePreKeys(tx, device.id, input.oneTimePreKeys);
    return toMyDeviceDTO(tx, device);
  });
}

async function storePreKeys(tx: Tx, deviceId: string, keys: RegisterDeviceInput["oneTimePreKeys"]) {
  if (!keys.length) return;
  const have = await tx.oneTimePreKey.count({ where: { deviceId } });
  if (have + keys.length > PREKEYS.max) {
    throw new AppError("VALIDATION_FAILED", `A device can keep at most ${PREKEYS.max} one-time prekeys`);
  }
  await tx.oneTimePreKey.createMany({
    data: keys.map((k) => ({ deviceId, keyId: k.id, pub: k.pub })),
    skipDuplicates: true,
  });
}

export async function addPreKeys(sessionId: string, input: AddPreKeysInput) {
  return prisma.$transaction(async (tx) => {
    const device = await myDevice(tx, sessionId);
    await storePreKeys(tx, device.id, input.oneTimePreKeys);
    return toMyDeviceDTO(tx, device);
  });
}

export async function rotateSignedPreKey(sessionId: string, signedPreKey: SignedPreKeyJSON) {
  const device = await myDevice(prisma, sessionId);
  checkKeys(identityOf(device), signedPreKey);
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      signedPreKeyId: signedPreKey.id,
      signedPreKey: signedPreKey.pub,
      signedPreKeySig: signedPreKey.sig,
      signedPreKeyAt: new Date(),
    },
  });
  return toMyDeviceDTO(prisma, updated);
}

async function assertCanSee(db: Tx, viewerId: string, userIds: string[]) {
  const audience = await audienceOf(db, viewerId);
  if (userIds.some((id) => !audience.has(id))) throw new AppError("USER_NOT_FOUND");
}

export async function listDevices(viewerId: string, userIds: string[]) {
  await assertCanSee(prisma, viewerId, userIds);
  return (await activeDevices(prisma, userIds)).map(toDeviceDTO);
}

/**
 * Hands out one prekey bundle per device so the caller can start sessions. Each one-time prekey is
 * given out once (taken with SKIP LOCKED so two callers never get the same one); when a device has
 * none left the bundle has only its signed prekey, which still works, with less forward secrecy.
 */
export async function claimPreKeys(viewerId: string, deviceIds: string[]): Promise<PreKeyBundleDTO[]> {
  return prisma.$transaction(async (tx) => {
    const devices = await tx.device.findMany({ where: { id: { in: deviceIds }, ...activeDevice() } });
    if (devices.length !== new Set(deviceIds).size) throw new AppError("NOT_FOUND", "Unknown device");
    await assertCanSee(tx, viewerId, [...new Set(devices.map((d) => d.userId))]);

    const bundles: PreKeyBundleDTO[] = [];
    for (const d of devices) {
      const [otk] = await tx.$queryRaw<{ keyId: number; pub: string }[]>`
        DELETE FROM "OneTimePreKey" o
        USING (
          SELECT "deviceId", "keyId" FROM "OneTimePreKey" WHERE "deviceId" = ${d.id}
          ORDER BY "keyId" LIMIT 1 FOR UPDATE SKIP LOCKED
        ) pick
        WHERE o."deviceId" = pick."deviceId" AND o."keyId" = pick."keyId"
        RETURNING o."keyId", o."pub"`;
      bundles.push({
        deviceId: d.id,
        userId: d.userId,
        identity: identityOf(d),
        signedPreKey: { id: d.signedPreKeyId, pub: d.signedPreKey, sig: d.signedPreKeySig },
        oneTimePreKey: otk ? { id: otk.keyId, pub: otk.pub } : null,
      });
    }
    return bundles;
  });
}

/** Forgets the device of a session that was signed out, and tells the people who send to it. */
export async function dropDevice(sessionId: string) {
  await withEvents(async (tx, emit) => {
    const device = await tx.device.findUnique({ where: { sessionId } });
    if (!device) return;
    await tx.device.delete({ where: { id: device.id } });
    await announceDevices(tx, emit, device.userId);
  });
}

/**
 * Checks that encrypted content was sealed for exactly the devices that should get it: every
 * device of every chat member except the one sending. Anything else means the sender's device list
 * is stale, so it gets DEVICES_CHANGED with what to fix and retries.
 */
export async function checkEnvelopes(
  tx: Tx,
  chatId: string,
  sessionId: string,
  envelopes: DeviceEnvelope[],
): Promise<string> {
  const sender = await myDevice(tx, sessionId);
  const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
  const expected = new Set(
    (await activeDevices(tx, members.map((m) => m.userId))).map((d) => d.id).filter((id) => id !== sender.id),
  );
  const given = new Set(envelopes.map((e) => e.deviceId));
  const missing = [...expected].filter((id) => !given.has(id));
  const extra = [...given].filter((id) => !expected.has(id));
  if (missing.length || extra.length) {
    throw new AppError("DEVICES_CHANGED", "Someone's devices changed; refresh them and encrypt again", {
      missing,
      extra,
    });
  }
  return sender.id;
}
