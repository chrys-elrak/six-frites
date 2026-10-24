import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      WEB_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://six:six@localhost:5432/six?schema=test",
      GOOGLE_CLIENT_IDS: "test-client",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
    },
  },
});
