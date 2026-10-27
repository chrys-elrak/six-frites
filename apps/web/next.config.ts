import type { NextConfig } from "next";

const config: NextConfig = {
  env: { BUILD_ID: Date.now().toString(36) },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  transpilePackages: ["@six/sdk", "@six/shared", "@six/crypto"],
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
