import { createHash, randomBytes } from "node:crypto";

import { chromium, type FullConfig } from "@playwright/test";
import { Client } from "pg";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

import { emptyTestDatabase, prepareTestDatabase, testDatabaseUrl } from "../support/test-database";

// The dev server compiles a page and its browser code on first request, and tells every open page
// that it is rebuilding. Left to the tests, this happens while other workers fill in forms.
// So the pages are opened once in a browser before any test starts.
const PAGES = [
  "/",
  "/users",
  "/users/new",
  "/users/{id}",
  "/users/{id}/edit",
  "/profile",
  "/forbidden",
  // Where a browser with a revoked session is sent; with a live one it leads home.
  "/api/auth/clear-session",
];

function cuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function insertWarmUpSession(databaseUrl: string) {
  const userId = cuid();
  const token = randomBytes(32).toString("base64url");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "User" (id, login, "fullName", role, "passwordHash", "updatedAt")
       VALUES ($1, 'e2e.warmup', 'Warm-up', 'ADMIN', '-', now())`,
      [userId],
    );
    await client.query(
      `INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [cuid(), userId, createHash("sha256").update(token).digest("hex")],
    );
  } finally {
    await client.end();
  }
  return { userId, token };
}

async function openPages(baseURL: string, databaseUrl: string): Promise<void> {
  const { userId, token } = await insertWarmUpSession(databaseUrl);
  const browser = await chromium.launch();
  try {
    const visitor = await browser.newPage({ baseURL });
    await visitor.goto("/login", { waitUntil: "networkidle", timeout: 180_000 });

    const context = await browser.newContext({ baseURL });
    await context.addCookies([
      { name: SESSION_COOKIE_NAME, value: token, url: baseURL, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path.replace("{id}", userId), { waitUntil: "networkidle", timeout: 180_000 });
    }
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  const databaseUrl = testDatabaseUrl("e2e");
  await prepareTestDatabase(databaseUrl);
  // A run stopped during the warm-up leaves its user behind and would fail every later warm-up.
  await emptyTestDatabase(databaseUrl);

  const { baseURL } = config.projects[0].use;
  if (baseURL) await openPages(baseURL, databaseUrl);

  // Every test makes its own users, so nothing left from the warm-up or an earlier run is needed.
  await emptyTestDatabase(databaseUrl);
}
