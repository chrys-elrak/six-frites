#!/usr/bin/env node
/**
 * One-time App Store signing setup through the App Store Connect API, so no device or Xcode login is needed: turns on
 * push for the App ID, creates an Apple Distribution certificate kept in its own keychain, and an App Store profile
 * named "Six Frites App Store" installed where Xcode looks. Run it again to replace the profile, say after adding a
 * capability. Reads and extends signing/apple.env.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, importPKCS8 } from "jose";

const BUNDLE_ID = "com.sixfrites.app";
const PROFILE_NAME = "Six Frites App Store";
const CAPABILITIES = ["PUSH_NOTIFICATIONS", "ASSOCIATED_DOMAINS"];

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

const bundle = (await api("GET", `/v1/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=200`)).find(
  (b) => b.attributes.identifier === BUNDLE_ID,
);
if (!bundle) throw new Error(`${BUNDLE_ID} isn't registered as an App ID`);
const have = (await api("GET", `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`)).map((c) => c.attributes.capabilityType);
for (const capabilityType of CAPABILITIES.filter((c) => !have.includes(c))) {
  await api("POST", "/v1/bundleIdCapabilities", {
    type: "bundleIdCapabilities",
    attributes: { capabilityType },
    relationships: { bundleId: { data: { type: "bundleIds", id: bundle.id } } },
  });
  console.log(`Turned on ${capabilityType} for ${BUNDLE_ID}`);
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

for (const old of await api("GET", `/v1/profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}`)) {
  await api("DELETE", `/v1/profiles/${old.id}`);
}
const profile = await api("POST", "/v1/profiles", {
  type: "profiles",
  attributes: { name: PROFILE_NAME, profileType: "IOS_APP_STORE" },
  relationships: {
    bundleId: { data: { type: "bundleIds", id: bundle.id } },
    certificates: { data: [{ type: "certificates", id: certId }] },
  },
});
const content = Buffer.from(profile.attributes.profileContent, "base64");
for (const dir of ["Library/MobileDevice/Provisioning Profiles", "Library/Developer/Xcode/UserData/Provisioning Profiles"]) {
  mkdirSync(join(homedir(), dir), { recursive: true });
  writeFileSync(join(homedir(), dir, `${profile.attributes.uuid}.mobileprovision`), content);
}
console.log(`Installed profile "${PROFILE_NAME}" (${profile.attributes.uuid})`);
