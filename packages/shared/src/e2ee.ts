import { z } from "zod";
import { Id, IsoDate } from "./common.js";

const Key = z
  .string()
  .regex(/^[\w-]{43}$/)
  .describe("A 32-byte public key, base64url without padding");
const Signature = z
  .string()
  .regex(/^[\w-]{86}$/)
  .describe("A 64-byte Ed25519 signature, base64url without padding");
const KeyId = z.number().int().min(0).max(0xffffffff);
const Blob = (max: number) => z.string().regex(/^[\w-]+$/).max(max);

export const PublicIdentityJSON = z.object({
  signPub: Key.describe("Ed25519 identity key"),
  dhPub: Key.describe("X25519 identity key, signed by signPub"),
  dhSig: Signature,
});
export type PublicIdentityJSON = z.infer<typeof PublicIdentityJSON>;

export const SignedPreKeyJSON = z.object({ id: KeyId, pub: Key, sig: Signature });
export type SignedPreKeyJSON = z.infer<typeof SignedPreKeyJSON>;

export const OneTimePreKeyJSON = z.object({ id: KeyId, pub: Key });
export type OneTimePreKeyJSON = z.infer<typeof OneTimePreKeyJSON>;

/** How many one-time prekeys a device keeps on the server, and when it should top them up. */
export const PREKEYS = { batch: 100, low: 20, max: 200 } as const;

const OneTimePreKeys = z
  .array(OneTimePreKeyJSON)
  .max(PREKEYS.max)
  .refine((keys) => new Set(keys.map((k) => k.id)).size === keys.length, "Prekey ids must be unique");

export const RegisterDeviceInput = z.object({
  identity: PublicIdentityJSON,
  signedPreKey: SignedPreKeyJSON,
  oneTimePreKeys: OneTimePreKeys,
});
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceInput>;

export const AddPreKeysInput = z.object({ oneTimePreKeys: OneTimePreKeys.refine((k) => k.length > 0, "Send at least one") });
export type AddPreKeysInput = z.infer<typeof AddPreKeysInput>;

export const RotateSignedPreKeyInput = z.object({ signedPreKey: SignedPreKeyJSON });
export type RotateSignedPreKeyInput = z.infer<typeof RotateSignedPreKeyInput>;

export const DeviceDTO = z.object({
  id: Id,
  userId: Id,
  identity: PublicIdentityJSON,
  createdAt: IsoDate,
});
export type DeviceDTO = z.infer<typeof DeviceDTO>;

export const MyDeviceDTO = DeviceDTO.extend({
  signedPreKeyId: KeyId,
  signedPreKeyAt: IsoDate.describe("Rotate the signed prekey about once a week"),
  oneTimePreKeys: z.number().int().describe(`One-time prekeys left; add more when under ${PREKEYS.low}`),
});
export type MyDeviceDTO = z.infer<typeof MyDeviceDTO>;

export const DeviceListQuery = z.object({
  userIds: z
    .string()
    .max(2000)
    .describe("Comma-separated user ids, at most 20: yourself or people you share a chat with")
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
    .refine((ids) => ids.length >= 1 && ids.length <= 20, "Provide between 1 and 20 ids"),
});
export type DeviceListQuery = z.infer<typeof DeviceListQuery>;

export const ClaimPreKeysInput = z.object({ deviceIds: z.array(Id).min(1).max(50) });
export type ClaimPreKeysInput = z.infer<typeof ClaimPreKeysInput>;

export const PreKeyBundleDTO = z.object({
  deviceId: Id,
  userId: Id,
  identity: PublicIdentityJSON,
  signedPreKey: SignedPreKeyJSON,
  oneTimePreKey: OneTimePreKeyJSON.nullable().describe("Handed out once; null when the device ran out"),
});
export type PreKeyBundleDTO = z.infer<typeof PreKeyBundleDTO>;

/** One Double Ratchet message for one device, as produced by @six/crypto. */
export const EnvelopeJSON = z.object({
  v: z.literal(1),
  x3dh: z
    .object({
      identity: PublicIdentityJSON,
      ephemeral: Key,
      signedPreKeyId: KeyId,
      oneTimePreKeyId: KeyId.nullable(),
    })
    .optional(),
  header: Blob(128),
  body: Blob(64 * 1024),
});
export type EnvelopeJSON = z.infer<typeof EnvelopeJSON>;

export const DeviceEnvelope = z.object({ deviceId: Id, envelope: EnvelopeJSON });
export type DeviceEnvelope = z.infer<typeof DeviceEnvelope>;

const SealedBackup = Blob(64 * 1024).describe("The content sealed with your backup key (@six/crypto sealBackup)");

export const EncryptedInput = z
  .object({
    envelopes: z
      .array(DeviceEnvelope)
      .max(50)
      .refine((e) => new Set(e.map((x) => x.deviceId)).size === e.length, "One envelope per device")
      .describe("One per device of every member, your other devices included, except the one sending"),
    backup: SealedBackup.optional(),
  })
  .describe("End-to-end encrypted content. The server rejects it with DEVICES_CHANGED if a device is missing or unknown.");
export type EncryptedInput = z.infer<typeof EncryptedInput>;

export const EncryptionDTO = z.object({
  senderDeviceId: Id.nullable().describe("The device that encrypted it; open the envelope with your session with it"),
  envelopes: z.array(DeviceEnvelope).describe("Only the envelopes for your own devices"),
  backup: SealedBackup.nullable().describe("Your backup copy, if you stored one"),
});
export type EncryptionDTO = z.infer<typeof EncryptionDTO>;

export const DevicesChangedDetails = z.object({
  missing: z.array(Id).describe("Devices that need an envelope"),
  extra: z.array(Id).describe("Envelopes for devices that are gone"),
});
export type DevicesChangedDetails = z.infer<typeof DevicesChangedDetails>;

export const DevicesChangedDTO = z.object({ userId: Id });
export type DevicesChangedDTO = z.infer<typeof DevicesChangedDTO>;

export const StoreBackupsInput = z.object({
  items: z
    .array(z.object({ messageId: Id, sealed: SealedBackup }))
    .min(1)
    .max(100),
});
export type StoreBackupsInput = z.infer<typeof StoreBackupsInput>;

export const SetBackupKeyInput = z.object({
  backupKeyId: z
    .string()
    .regex(/^[\w-]{22}$/)
    .describe("@six/crypto backupKeyId of the key derived from your recovery key"),
});
export type SetBackupKeyInput = z.infer<typeof SetBackupKeyInput>;

const BackupPin = z.string().regex(/^\d{6}$/).describe("6 digits");

export const SetBackupPinInput = SetBackupKeyInput.extend({
  pin: BackupPin,
  wrapped: Blob(128).describe("Your backup key sealed with the PIN and your backup secret (@six/crypto wrapBackupKey)"),
});
export type SetBackupPinInput = z.infer<typeof SetBackupPinInput>;

export const BackupPinInput = z.object({ pin: BackupPin });
export type BackupPinInput = z.infer<typeof BackupPinInput>;

export const BackupSecretDTO = z.object({ secret: Key.describe("Mixed into wrapBackupKey; always the same for you") });
export type BackupSecretDTO = z.infer<typeof BackupSecretDTO>;

export const UnlockedBackupDTO = BackupSecretDTO.extend({
  wrapped: z.string().describe("Open it with @six/crypto unwrapBackupKey to get your backup key"),
});
export type UnlockedBackupDTO = z.infer<typeof UnlockedBackupDTO>;
