import type { NextConfig } from "next";

const config: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  transpilePackages: ["@six/sdk", "@six/shared", "@six/crypto"],
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
