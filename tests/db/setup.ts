import { afterAll, beforeEach, vi } from "vitest";

import { db } from "@/lib/db";

import { EMPTY_TEST_DATABASE_SQL } from "../support/test-database";
import { resetRequest } from "./request";

// Actions and queries work with the real test database. Only what Next.js gives a request is
// replaced: cookies and headers, translations (the real ru.json) and the page cache.
vi.mock("next/headers", async () => (await import("./request")).nextHeaders);
vi.mock("next-intl/server", async () => (await import("./translations")).nextIntlServer);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => {
  resetRequest();
  await db.$executeRawUnsafe(EMPTY_TEST_DATABASE_SQL);
});

afterAll(async () => {
  await db.$disconnect();
});
