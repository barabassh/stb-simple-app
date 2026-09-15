import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./tests/support/test-database";

export default defineConfig({
  // tsconfig keeps JSX for Next.js to compile; tests import .tsx modules directly.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // For every test file, so that no test can reach the developer's database.
    env: { DATABASE_URL: testDatabaseUrl("vitest") },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/db/setup.ts"],
          // Every test starts from an empty database, so files must not run at the same time.
          fileParallelism: false,
        },
      },
    ],
  },
});
