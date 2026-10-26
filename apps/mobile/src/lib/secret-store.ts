import { b64, fromB64, fromUtf8, openBackup, randomBytes, sealBackup, utf8 } from "@six/crypto";
import type { SecretStore } from "@six/sdk";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

/**
 * Keeps the encryption keys, sessions and decrypted messages of one account on this phone. Each
 * value is sealed with a random key held in the Android Keystore (via expo-secure-store) and
 * written to its own file, since secure storage itself only suits small values.
 */
export class DeviceSecretStore implements SecretStore {
  private readonly dir: Directory;
  private readonly keyName: string;
  private key: Promise<Uint8Array> | null = null;

  constructor(userId: string) {
    this.dir = new Directory(Paths.document, "e2ee", userId);
    this.keyName = `six.e2ee.${userId}`;
  }

  private masterKey() {
    this.key ??= (async () => {
      const saved = await SecureStore.getItemAsync(this.keyName);
      if (saved) return fromB64(saved);
      const fresh = randomBytes(32);
      await SecureStore.setItemAsync(this.keyName, b64(fresh));
      return fresh;
    })();
    return this.key;
  }

  private file(key: string) {
    return new File(this.dir, key.replace(/[^\w.-]/g, (c) => `~${c.charCodeAt(0).toString(16)}`));
  }

  async get(key: string) {
    const f = this.file(key);
    if (!f.exists) return null;
    try {
      return fromUtf8(openBackup(await this.masterKey(), await f.text(), utf8(key)));
    } catch {
      return null;
    }
  }

  async set(key: string, value: string) {
    if (!this.dir.exists) this.dir.create({ intermediates: true });
    const f = this.file(key);
    if (!f.exists) f.create();
    await f.write(sealBackup(await this.masterKey(), utf8(value), utf8(key)));
  }

  async delete(key: string) {
    const f = this.file(key);
    if (f.exists) f.delete();
  }

  async clear() {
    if (this.dir.exists) this.dir.delete();
    await SecureStore.deleteItemAsync(this.keyName);
    this.key = null;
  }
}
