import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      WEB_ORIGIN: "http://localhost:3000",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://six:six@localhost:5432/six?schema=test",
      GOOGLE_CLIENT_IDS: "test-client",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:8333",
      S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:8333",
      S3_BUCKET: "six-test",
      S3_ACCESS_KEY: "six",
      S3_SECRET_KEY: "six-dev-secret-key",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    },
  },
});
