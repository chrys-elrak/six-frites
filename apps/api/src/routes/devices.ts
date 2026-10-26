import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  AddPreKeysInput,
  ClaimPreKeysInput,
  DeviceDTO,
  DeviceListQuery,
  MyDeviceDTO,
  PREKEYS,
  PreKeyBundleDTO,
  RegisterDeviceInput,
  RotateSignedPreKeyInput,
  SetBackupKeyInput,
  StoreBackupsInput,
  UserDTO,
} from "@six/shared";
import { z } from "zod";
import { setBackupKey, storeBackups } from "../services/backups.js";
import {
  addPreKeys,
  claimPreKeys,
  getMyDevice,
  listDevices,
  registerDevice,
  rotateSignedPreKey,
} from "../services/devices.js";

const security = [{ bearer: [] }];

const deviceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", app.requireAuth);

  app.put(
    "/devices/me",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["encryption"],
        summary: "Publish this device's public keys",
        description: `The device is the signed-in session. Send its identity key, a signed prekey and up to ${PREKEYS.max} one-time prekeys. The same identity again only refreshes prekeys; a new identity replaces the device (new id), and everyone who shares a chat with you gets \`devices.changed\`. Signing out removes the device.`,
        security,
        body: RegisterDeviceInput,
        response: { 200: MyDeviceDTO },
      },
    },
    (req) => registerDevice(req.auth.userId, req.auth.sessionId, req.body),
  );

  app.get(
    "/devices/me",
    {
      schema: {
        tags: ["encryption"],
        summary: "This device's key status",
        description: `DEVICE_NOT_REGISTERED until keys are published. Add one-time prekeys when fewer than ${PREKEYS.low} are left and rotate the signed prekey weekly.`,
        security,
        response: { 200: MyDeviceDTO },
      },
    },
    (req) => getMyDevice(req.auth.sessionId),
  );

  app.post(
    "/devices/me/prekeys",
    {
      schema: {
        tags: ["encryption"],
        summary: "Add one-time prekeys",
        security,
        body: AddPreKeysInput,
        response: { 200: MyDeviceDTO },
      },
    },
    (req) => addPreKeys(req.auth.sessionId, req.body),
  );

  app.put(
    "/devices/me/signed-prekey",
    {
      schema: {
        tags: ["encryption"],
        summary: "Rotate the signed prekey",
        description: "Keep the previous one for a while: messages started with it can still arrive.",
        security,
        body: RotateSignedPreKeyInput,
        response: { 200: MyDeviceDTO },
      },
    },
    (req) => rotateSignedPreKey(req.auth.sessionId, req.body.signedPreKey),
  );

  app.get(
    "/devices",
    {
      schema: {
        tags: ["encryption"],
        summary: "Signed-in devices of people",
        description: "Yourself and people you share a chat with. Encrypt every message for all of them.",
        security,
        querystring: DeviceListQuery,
        response: { 200: z.object({ items: z.array(DeviceDTO) }) },
      },
    },
    async (req) => ({ items: await listDevices(req.auth.userId, req.query.userIds) }),
  );

  app.post(
    "/devices/prekeys/claim",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["encryption"],
        summary: "Get prekey bundles to start sessions",
        description: "Each one-time prekey is handed out once. Only claim for devices you have no session with.",
        security,
        body: ClaimPreKeysInput,
        response: { 200: z.object({ items: z.array(PreKeyBundleDTO) }) },
      },
    },
    async (req) => ({ items: await claimPreKeys(req.auth.userId, req.body.deviceIds) }),
  );

  app.put(
    "/me/backup-key",
    {
      schema: {
        tags: ["encryption"],
        summary: "Set which recovery key your backups use",
        description:
          "Send the id of the backup key derived from your recovery key. Changing it deletes the backups sealed with the previous key.",
        security,
        body: SetBackupKeyInput,
        response: { 200: UserDTO },
      },
    },
    (req) => setBackupKey(req.auth.userId, req.body.backupKeyId),
  );

  app.post(
    "/messages/backups",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["encryption"],
        summary: "Store your backup copies of encrypted messages",
        description:
          "After decrypting a message, seal its content with your backup key and store it here, so a new device with your recovery key can read your history.",
        security,
        body: StoreBackupsInput,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await storeBackups(req.auth.userId, req.body);
      return reply.status(204).send(null);
    },
  );
};

export default deviceRoutes;
