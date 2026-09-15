import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { Client } from "pg";

/**
 * Tests get databases of their own on the developer's PostgreSQL server, named after the
 * developer's database. Vitest and Playwright use different ones: each empties its database
 * while running, and the two suites may well run at the same time.
 */
export type TestSuite = "vitest" | "e2e";

const SUFFIXES: Record<TestSuite, string> = { vitest: "_test", e2e: "_e2e_test" };
const SUFFIX_PATTERN = /(_e2e)?_test$/;

function configuredDatabaseUrl(): string {
  // A variable set in the environment wins over .env, as with Next.js and Prisma.
  const fromFile = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
  const url = process.env.DATABASE_URL ?? fromFile.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example).");
  }
  return url;
}

/** Stays the same when DATABASE_URL already points at a test database, e.g. inside Vitest. */
export function testDatabaseUrl(suite: TestSuite): string {
  const url = new URL(configuredDatabaseUrl());
  const name = decodeURIComponent(url.pathname.slice(1)).replace(SUFFIX_PATTERN, "");
  url.pathname = `/${encodeURIComponent(name + SUFFIXES[suite])}`;
  return url.toString();
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

async function withMaintenanceClient<T>(url: string, work: (client: Client) => Promise<T>) {
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function assertTestDatabase(url: string): void {
  if (!SUFFIX_PATTERN.test(databaseName(url))) {
    throw new Error(`Refusing to touch "${databaseName(url)}": it is not a test database.`);
  }
}

function localMigrations(): string[] {
  return readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function pendingMigrations(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
    );
    const applied = new Set(rows.map((row) => row.migration_name));
    return localMigrations().some((name) => !applied.has(name));
  } catch {
    return true;
  } finally {
    await client.end();
  }
}

/**
 * Creates the database if it does not exist yet and applies the migrations it lacks.
 * `recreate` drops it first, for a database left in a state migrations cannot fix.
 */
export async function prepareTestDatabase(
  url: string,
  { recreate = false }: { recreate?: boolean } = {},
): Promise<void> {
  assertTestDatabase(url);
  const name = databaseName(url);

  await withMaintenanceClient(url, async (client) => {
    if (recreate) await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    const { rowCount } = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [name]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  });

  if (!(await pendingMigrations(url))) return;
  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer }) ?? {};
    throw new Error(
      `Migrations failed on "${name}":\n${output.stdout ?? ""}${output.stderr ?? ""}`.trim(),
    );
  }
}

/**
 * Empties every table except the migration history. The database name is checked by PostgreSQL
 * itself, so a client pointed at any other database fails instead of wiping it.
 */
export const EMPTY_TEST_DATABASE_SQL = `
DO $$
DECLARE tables text;
BEGIN
  IF current_database() !~ '_test$' THEN
    RAISE EXCEPTION 'Refusing to empty %: it is not a test database', current_database();
  END IF;
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE ' || tables || ' CASCADE';
  END IF;
END $$`;

export async function emptyTestDatabase(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(EMPTY_TEST_DATABASE_SQL);
  } finally {
    await client.end();
  }
}
