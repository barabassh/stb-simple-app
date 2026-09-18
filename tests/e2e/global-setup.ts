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
  "/customers",
  "/customers/new",
  "/customers/{customer}",
  "/contractors/{contractor}",
  "/projects",
  "/projects/new",
  "/projects/{project}",
  "/projects/{project}/edit",
  "/projects/{closed}/edit",
  "/profile",
  "/settings",
  "/settings/company/history",
  "/forbidden",
  // Where a browser with a revoked session is sent; with a live one it leads home.
  "/api/auth/clear-session",
];

function cuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

/** A user with a session, and a record of each kind for the pages of a record to open with. */
async function insertWarmUpData(databaseUrl: string) {
  const userId = cuid();
  const token = randomBytes(32).toString("base64url");
  const ids = { id: userId, customer: cuid(), contractor: cuid(), project: cuid(), closed: cuid() };
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "User" (id, login, "fullName", nickname, role, "passwordHash", "updatedAt")
       VALUES ($1, 'e2e.warmup', 'Warm-up', 'e2e.warmup', 'ADMIN', '-', now())`,
      [userId],
    );
    await client.query(
      `INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [cuid(), userId, createHash("sha256").update(token).digest("hex")],
    );
    await client.query(
      `INSERT INTO "Customer" (id, name, "updatedAt") VALUES ($1, 'Warm-up', now())`,
      [ids.customer],
    );
    await client.query(
      `INSERT INTO "Contractor" (id, name, "updatedAt") VALUES ($1, 'Warm-up', now())`,
      [ids.contractor],
    );
    for (const [id, number, status] of [
      [ids.project, "WARMUP-1", "IN_PROGRESS"],
      [ids.closed, "WARMUP-2", "CLOSED"],
    ]) {
      await client.query(
        `INSERT INTO "Project" (id, number, name, "customerId", street, "houseNumber", postcode,
           city, "startDate", status, "closedAt", "updatedAt")
         VALUES ($1, $2, 'Warm-up', $3, 'Damrak', 1, '1012 LG', 'Amsterdam', '2026-09-01',
           $4::text::"ProjectStatus", CASE WHEN $4::text = 'CLOSED' THEN now() END, now())`,
        [id, number, ids.customer, status],
      );
    }
  } finally {
    await client.end();
  }
  return { ids, token };
}

async function openPages(baseURL: string, databaseUrl: string): Promise<void> {
  const { ids, token } = await insertWarmUpData(databaseUrl);
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
      const url = path.replace(/\{(\w+)\}/, (_, name: keyof typeof ids) => ids[name]);
      await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
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
