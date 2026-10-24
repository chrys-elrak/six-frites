const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const pinned = ["react", "react-native"];

/**
 * Pins react and react-native to this app's copies so hoisted libraries never pull in the web app's
 * React, and lets the workspace packages keep their ESM-style `./file.js` imports of TypeScript files.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const name of pinned) {
    if (moduleName === name || moduleName.startsWith(`${name}/`)) {
      return context.resolveRequest(
        { ...context, originModulePath: path.join(__dirname, "package.json") },
        moduleName,
        platform,
      );
    }
  }
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ""), platform);
    }
    throw err;
  }
};

module.exports = config;
