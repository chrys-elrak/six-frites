import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@six/sdk", "@six/shared"],
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
