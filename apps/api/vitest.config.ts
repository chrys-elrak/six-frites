import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://six:six@localhost:5432/six?schema=test",
      GOOGLE_CLIENT_IDS: "test-client",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
    },
  },
});
