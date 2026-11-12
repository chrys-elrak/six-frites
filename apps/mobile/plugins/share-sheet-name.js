const { withFinalizedMod } = require("expo/config-plugins");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Shows the iOS share extension as "Six Frites" in the share sheet. expo-share-intent takes that name only by also
 * naming its Xcode target after it, which would clash with the app's own SixFrites target. It writes the extension's
 * Info.plist while editing the Xcode project, so this runs at the very end.
 */
module.exports = (config) =>
  withFinalizedMod(config, [
    "ios",
    (c) => {
      const plist = join(c.modRequest.platformProjectRoot, "ShareExtension", "ShareExtension-Info.plist");
      const s = readFileSync(plist, "utf8");
      writeFileSync(plist, s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*/, "$1Six Frites"));
      return c;
    },
  ]);
