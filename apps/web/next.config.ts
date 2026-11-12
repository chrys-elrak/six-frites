import type { NextConfig } from "next";

const config: NextConfig = {
  env: { BUILD_ID: Date.now().toString(36) },
  devIndicators: false,
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  async rewrites() {
    return [{ source: "/__/auth/:path*", destination: "https://akondro.firebaseapp.com/__/auth/:path*" }];
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
  transpilePackages: ["@six/sdk", "@six/shared", "@six/crypto"],
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
};

export default config;
