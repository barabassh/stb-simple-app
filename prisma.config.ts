import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma CLI does not read .env on its own (Next.js and docker compose do).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
