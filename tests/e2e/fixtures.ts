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

/**
 * Renders a message with plural forms by taking one of its branches ("one", "few", "other", "=1"):
 * the branch's text replaces the whole `{count, plural, …}` block, with `#` in place of the number.
 * Enough to find such a message on the page; next-intl formats it in the application itself.
 */
export function plural(message: string, branch: string, count: number): string {
  const opened = message.indexOf("{");
  const closed = message.lastIndexOf("}");
  const block = message.slice(opened, closed + 1);
  const from = block.indexOf(`${branch} {`) + branch.length + 2;
  const body = block.slice(from, block.indexOf("}", from));

  return message.slice(0, opened) + body.replaceAll("#", String(count)) + message.slice(closed + 1);
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

/** Opens a picker of records and takes the one named, as the forms and the filter bars offer it. */
export async function chooseRecord(
  page: Page,
  field: string,
  search: string,
  name: string,
): Promise<void> {
  const picker = page.getByRole("combobox", { name: field, exact: true });
  await waitForHydration(picker);
  await picker.click();
  await page.getByRole("searchbox", { name: search }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

/** The phone layout scrolls only inside its blocks, never sideways (docs/ТЗ.md, 3.2). */
export async function expectNoPageScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(360);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
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

type NewUser = { role?: Role; contractorId?: string };

/** Prisma accepts only a CUID as an id, and Prisma is not here to make one. */
function cuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

/** A tag that makes the names and numbers of one test unique, so its search finds only its rows. */
export function uniqueTag(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export type TestRecord = { id: string; name: string };
export type TestProject = { id: string; number: string; name: string };

type NewReferenceRecord = { name?: string; isActive?: boolean };
type NewProject = {
  customerId: string;
  number?: string;
  name?: string;
  status?: "IN_PROGRESS" | "CLOSED";
  /** In euros without VAT, with the 21 % rate. */
  budgetAmount?: string;
};

type NewReport = {
  userId: string;
  projectId: string;
  /** The worker's organisation; omitted for an employee of the company itself. */
  contractorId?: string;
  /** `yyyy-MM-dd`, not before the project starts and not in the future. */
  workDate?: string;
  /** Minutes from midnight; reports of one worker on one day must not overlap. */
  startMinute?: number;
  endMinute?: number;
  mileageKm?: number;
  status?: "UNAPPROVED" | "APPROVED";
  workDescription?: string;
};

export type TestReport = { id: string; workDescription: string };

type DataFixtures = {
  createUser: (user?: NewUser) => Promise<TestUser>;
  createCustomer: (customer?: NewReferenceRecord) => Promise<TestRecord>;
  createContractor: (contractor?: NewReferenceRecord) => Promise<TestRecord>;
  /** Its number is not of the `ГГГГ-NNN` shape, so it never changes the number a form suggests. */
  createProject: (project: NewProject) => Promise<TestProject>;
  createReport: (report: NewReport) => Promise<TestReport>;
};

// Users are inserted with plain SQL: Playwright loads tests as CommonJS, and the generated Prisma
// client is an ES module.
export const test = base.extend<DataFixtures, { database: Pool; passwordHash: string }>({
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
    await provide(async ({ role = "EMPLOYEE", contractorId } = {}) => {
      const id = cuid();
      const login = uniqueLogin(role.toLowerCase());
      const fullName = `${messages.users.roles[role]} ${login.slice(-8)}`;
      await database.query(
        `INSERT INTO "User" (id, login, "fullName", nickname, role, "passwordHash", "contractorId", "updatedAt")
         VALUES ($1, $2, $3, $2, $4, $5, $6, now())`,
        [id, login, fullName, role, passwordHash, contractorId ?? null],
      );
      return { id, login, fullName, role, password: PASSWORD };
    });
  },
  createCustomer: async ({ database }, provide) => {
    await provide(async ({ name = `E2E Klant ${uniqueTag()}`, isActive = true } = {}) => {
      const id = cuid();
      await database.query(
        `INSERT INTO "Customer" (id, type, name, "isActive", "updatedAt")
         VALUES ($1, 'COMPANY', $2, $3, now())`,
        [id, name, isActive],
      );
      return { id, name };
    });
  },
  createContractor: async ({ database }, provide) => {
    await provide(async ({ name = `E2E Aannemer ${uniqueTag()}`, isActive = true } = {}) => {
      const id = cuid();
      await database.query(
        `INSERT INTO "Contractor" (id, name, "isActive", "updatedAt") VALUES ($1, $2, $3, now())`,
        [id, name, isActive],
      );
      return { id, name };
    });
  },
  createProject: async ({ database }, provide) => {
    await provide(async ({ customerId, status = "IN_PROGRESS", budgetAmount, ...project }) => {
      const id = cuid();
      const tag = uniqueTag();
      const number = project.number ?? `E2E-${tag}`;
      const name = project.name ?? `E2E Project ${tag}`;
      await database.query(
        `INSERT INTO "Project" (id, number, name, "customerId", street, "houseNumber", postcode,
           city, "startDate", "budgetAmount", "vatRate", status, "closedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Damrak', 1, '1012 LG', 'Amsterdam', '2026-09-01', $5, $6,
           $7::text::"ProjectStatus", CASE WHEN $7::text = 'CLOSED' THEN now() END, now())`,
        [
          id,
          number,
          name,
          customerId,
          budgetAmount ?? null,
          budgetAmount ? "STANDARD_21" : null,
          status,
        ],
      );
      return { id, number, name };
    });
  },
  createReport: async ({ database }, provide) => {
    await provide(async ({ userId, projectId, contractorId, ...report }) => {
      const id = cuid();
      const workDescription = report.workDescription ?? `E2E Werk ${uniqueTag()}`;
      const status = report.status ?? "UNAPPROVED";
      await database.query(
        `INSERT INTO "WorkReport" (id, "userId", "contractorId", "projectId", "workDate",
           "workDescription", "startMinute", "endMinute", "mileageKm", status, "approvedAt",
           "createdById", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::"WorkReportStatus",
           CASE WHEN $10::text = 'APPROVED' THEN now() END, $2, now())`,
        [
          id,
          userId,
          contractorId ?? null,
          projectId,
          report.workDate ?? "2026-09-02",
          workDescription,
          report.startMinute ?? 8 * 60,
          report.endMinute ?? 12 * 60,
          report.mileageKm ?? 0,
          status,
        ],
      );
      return { id, workDescription };
    });
  },
});

/**
 * For tests that save a project under the number the form suggests. The suggestion is not
 * reserved, and the Chromium and WebKit projects run the same test at once: both would be offered
 * the same number. A database lock across workers lets them take the numbers in turn.
 */
export const suggestedNumberTest = test.extend<{ suggestedNumberLock: void }>({
  suggestedNumberLock: [
    async ({ database }, provide) => {
      const client = await database.connect();
      try {
        await client.query(`SELECT pg_advisory_lock(hashtext('e2e.Project.number'))`);
        await provide();
      } finally {
        client.release(true);
      }
    },
    { auto: true, timeout: 300_000 },
  ],
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
