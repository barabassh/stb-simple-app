import { randomBytes } from "node:crypto";

import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";

import type { Role } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";

import messages from "../../messages/ru.json";
import { testDatabaseUrl } from "../support/test-database";

export { expect, messages };

export const PASSWORD = "E2eSecret2026";

export type Credentials = { login: string; password: string };
export type TestUser = Credentials & { id: string; fullName: string; role: Role };

/** Fills the placeholders of a message the way next-intl does for plain values. */
export function text(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}

/** Tests run in parallel on one database, so every login is unique. */
export function uniqueLogin(prefix: string): string {
  return `e2e.${prefix}.${randomBytes(4).toString("hex")}`;
}

/**
 * Waits until React has hydrated the element and committed it. Before that a click on a form
 * submits it natively, and a filled field is emptied again when react-hook-form registers it at
 * commit. React marks an element as soon as it renders it, which may be well before the commit in
 * a slow browser, so the element is looked for in the committed tree of the page instead.
 */
export async function waitForHydration(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        type Fiber = {
          child: Fiber | null;
          sibling: Fiber | null;
          alternate: Fiber | null;
          stateNode: { current?: Fiber } | null;
        };
        const internal = (node: object, prefix: string) => {
          const key = Object.keys(node).find((name) => name.startsWith(prefix));
          return key ? ((node as Record<string, unknown>)[key] as Fiber) : undefined;
        };

        const fiber = internal(element, "__reactFiber$");
        const committed = internal(document, "__reactContainer$")?.stateNode?.current;
        if (!fiber || !committed) return false;

        for (const stack = [committed]; stack.length > 0;) {
          const node = stack.pop()!;
          if (node === fiber || node === fiber.alternate) return true;
          if (node.sibling) stack.push(node.sibling);
          if (node.child) stack.push(node.child);
        }
        return false;
      }),
    )
    .toBe(true);
}

export async function signIn(page: Page, { login, password }: Credentials): Promise<void> {
  await page.goto("/login");
  const loginField = page.getByLabel(messages.auth.login.login, { exact: true });
  // The field rather than the button: react-hook-form empties it when registering it.
  await waitForHydration(loginField);
  await loginField.fill(login);
  await page.getByLabel(messages.auth.login.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: messages.auth.login.submit }).click();
}

const company = messages.settings.company;

/**
 * Opens the company profile dialog from /settings: "Fill in" while there is no profile, "Edit"
 * once there is. Tests that do not save take whichever the page shows, since a test in another
 * worker may be saving or deleting the profile meanwhile.
 */
export async function openCompanyDialog(page: Page): Promise<Locator> {
  await page.goto("/settings");
  const open = page
    .getByRole("button", { name: company.fill, exact: true })
    .or(page.getByRole("button", { name: company.edit, exact: true }));
  await waitForHydration(open);
  await open.click();

  const dialog = page.getByRole("dialog", { name: company.dialog.title });
  // The dialog moves the focus there once it is ready for input.
  await expect(dialog.getByLabel(company.fields.legalName)).toBeFocused();
  return dialog;
}

type NewUser = { role?: Role };

// Users are inserted with plain SQL: Playwright loads tests as CommonJS, and the generated Prisma
// client is an ES module.
export const test = base.extend<
  { createUser: (user?: NewUser) => Promise<TestUser> },
  { database: Pool; passwordHash: string }
>({
  // The callbacks are not named `use`: the React hooks lint rule would take them for React's `use`.
  database: [
    async ({}, provide) => {
      const database = new Pool({ connectionString: testDatabaseUrl("e2e") });
      await provide(database);
      await database.end();
    },
    { scope: "worker" },
  ],
  passwordHash: [async ({}, provide) => provide(await hashPassword(PASSWORD)), { scope: "worker" }],
  createUser: async ({ database, passwordHash }, provide) => {
    await provide(async ({ role = "EMPLOYEE" } = {}) => {
      // Pages accept only a CUID as the id of a user, and Prisma is not here to make one.
      const id = `c${randomBytes(12).toString("hex")}`;
      const login = uniqueLogin(role.toLowerCase());
      const fullName = `${messages.users.roles[role]} ${login.slice(-8)}`;
      await database.query(
        `INSERT INTO "User" (id, login, "fullName", role, "passwordHash", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, login, fullName, role, passwordHash],
      );
      return { id, login, fullName, role, password: PASSWORD };
    });
  },
});

/**
 * For tests that save the company profile. There is one profile per database, and the Chromium
 * and WebKit projects run the same file in different workers at once, so neither serial mode nor
 * a single worker per file keeps them apart: a database lock does, across workers and projects.
 * The profile is deleted under the lock, so every such test starts from the empty state.
 */
export const companyProfileTest = test.extend<{ emptyCompanyProfile: void }>({
  emptyCompanyProfile: [
    async ({ database }, provide) => {
      const client = await database.connect();
      try {
        await client.query(`SELECT pg_advisory_lock(hashtext('e2e.CompanyProfile'))`);
        await client.query(`DELETE FROM "CompanyProfile"`);
        await provide();
      } finally {
        // Closing the connection releases the lock even if the unlock itself was not reached.
        client.release(true);
      }
    },
    // Waiting for the tests of the other project is not part of a test's own time.
    { auto: true, timeout: 300_000 },
  ],
});
