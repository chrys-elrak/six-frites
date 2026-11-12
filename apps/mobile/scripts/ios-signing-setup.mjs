#!/usr/bin/env node
/**
 * One-time App Store signing setup through the App Store Connect API, so no device or Xcode login is needed: registers
 * the app's and its share extension's App IDs with their capabilities, creates an Apple Distribution certificate kept
 * in its own keychain, and an App Store profile for each, installed where Xcode looks. Run it again to replace the
 * profiles, say after adding a capability. Reads and extends signing/apple.env.
 *
 * The API can turn App Groups on but can't attach a group to an App ID: that is done once on developer.apple.com, and
 * the script says so when a profile comes back without the group.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, importPKCS8 } from "jose";

const APP_GROUP = "group.com.sixfrites.app";
const TARGETS = [
  {
    id: "com.sixfrites.app",
    name: "Six Frites",
    profile: "Six Frites App Store",
    capabilities: ["PUSH_NOTIFICATIONS", "ASSOCIATED_DOMAINS", "APP_GROUPS"],
  },
  { id: "com.sixfrites.app.share-extension", name: "Six Frites Share", profile: "Six Frites Share App Store", capabilities: ["APP_GROUPS"] },
];

const signing = join(dirname(fileURLToPath(import.meta.url)), "..", "signing");
const envFile = join(signing, "apple.env");
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const keychain = join(homedir(), "Library/Keychains/six-frites-build.keychain-db");
const run = (cmd, args, input) => execFileSync(cmd, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });

const key = await importPKCS8(readFileSync(join(signing, `AuthKey_${env.APPLE_KEY_ID}.p8`), "utf8"), "ES256");
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" })
  .setIssuer(env.APPLE_ISSUER_ID)
  .setIssuedAt()
  .setExpirationTime("15m")
  .setAudience("appstoreconnect-v1")
  .sign(key);

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body && JSON.stringify({ data: body }),
  });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json?.errors ?? json)}`);
  return json?.data;
}

for (const target of TARGETS) {
  target.bundle =
    (await api("GET", `/v1/bundleIds?filter[identifier]=${target.id}&limit=200`)).find((b) => b.attributes.identifier === target.id) ??
    (await api("POST", "/v1/bundleIds", { type: "bundleIds", attributes: { identifier: target.id, name: target.name, platform: "IOS" } }));
  const have = (await api("GET", `/v1/bundleIds/${target.bundle.id}/bundleIdCapabilities`)).map((c) => c.attributes.capabilityType);
  for (const capabilityType of target.capabilities.filter((c) => !have.includes(c))) {
    await api("POST", "/v1/bundleIdCapabilities", {
      type: "bundleIdCapabilities",
      attributes: { capabilityType },
      relationships: { bundleId: { data: { type: "bundleIds", id: target.bundle.id } } },
    });
    console.log(`Turned on ${capabilityType} for ${target.id}`);
  }
}

let certId = env.APPLE_CERTIFICATE_ID;
if (!certId) {
  const work = join(signing, "tmp-cert");
  mkdirSync(work, { recursive: true });
  try {
    const keyPem = join(work, "key.pem");
    run("/usr/bin/openssl", ["genrsa", "-out", keyPem, "2048"]);
    const csr = run("/usr/bin/openssl", ["req", "-new", "-key", keyPem, "-subj", "/CN=Six Frites/C=MG"]);
    const cert = await api("POST", "/v1/certificates", {
      type: "certificates",
      attributes: { certificateType: "DISTRIBUTION", csrContent: csr },
    });
    certId = cert.id;
    const der = join(work, "cert.der");
    writeFileSync(der, Buffer.from(cert.attributes.certificateContent, "base64"));
    const certPem = join(work, "cert.pem");
    run("/usr/bin/openssl", ["x509", "-inform", "DER", "-in", der, "-out", certPem]);
    const p12Password = randomBytes(18).toString("base64url");
    const p12 = join(signing, "ios-distribution.p12");
    run("/usr/bin/openssl", ["pkcs12", "-export", "-inkey", keyPem, "-in", certPem, "-out", p12, "-passout", `pass:${p12Password}`]);

    const keychainPassword = randomBytes(18).toString("base64url");
    if (existsSync(keychain)) run("security", ["delete-keychain", keychain]);
    run("security", ["create-keychain", "-p", keychainPassword, keychain]);
    run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
    run("security", ["unlock-keychain", "-p", keychainPassword, keychain]);
    run("security", ["import", p12, "-k", keychain, "-P", p12Password, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
    run("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", keychainPassword, keychain]);
    const listed = run("security", ["list-keychains", "-d", "user"])
      .split("\n")
      .map((l) => l.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    if (!listed.includes(keychain)) run("security", ["list-keychains", "-d", "user", "-s", ...listed, keychain]);
    appendFileSync(
      envFile,
      `APPLE_CERTIFICATE_ID=${certId}\nAPPLE_P12_PASSWORD=${p12Password}\nAPPLE_KEYCHAIN_PASSWORD=${keychainPassword}\n`,
    );
    console.log(`Created Apple Distribution certificate ${certId}, in ${keychain} and signing/ios-distribution.p12`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

let groupMissing = false;
for (const target of TARGETS) {
  for (const old of await api("GET", `/v1/profiles?filter[name]=${encodeURIComponent(target.profile)}`)) {
    await api("DELETE", `/v1/profiles/${old.id}`);
  }
  const profile = await api("POST", "/v1/profiles", {
    type: "profiles",
    attributes: { name: target.profile, profileType: "IOS_APP_STORE" },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: target.bundle.id } },
      certificates: { data: [{ type: "certificates", id: certId }] },
    },
  });
  const content = Buffer.from(profile.attributes.profileContent, "base64");
  for (const dir of ["Library/MobileDevice/Provisioning Profiles", "Library/Developer/Xcode/UserData/Provisioning Profiles"]) {
    mkdirSync(join(homedir(), dir), { recursive: true });
    writeFileSync(join(homedir(), dir, `${profile.attributes.uuid}.mobileprovision`), content);
  }
  console.log(`Installed profile "${target.profile}" (${profile.attributes.uuid})`);
  if (!content.includes(APP_GROUP)) groupMissing = true;
}
if (groupMissing) {
  console.log(
    `\nThe profiles don't carry the App Group yet. On developer.apple.com, under Identifiers, add the App Group ${APP_GROUP},` +
      ` tick it under App Groups for ${TARGETS.map((t) => t.id).join(" and ")}, then run this again.`,
  );
  process.exitCode = 1;
}
