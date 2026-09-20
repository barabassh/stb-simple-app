import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

import { Client } from "pg";

import { budgetWithVat } from "@/features/projects/budget";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

import { prepareTestDatabase, testDatabaseUrl } from "../support/test-database";

// `npm run test:prod`: the check that a project's budget never reaches an employee or a contractor
// (docs/ТЗ.md, 6.9; docs/ПРАВА-ДОСТУПА.md, rule 19). It runs on a production build of its own
// rather than under Playwright, because `next dev` puts the results of the server's queries into
// the page stream for its debugging tools, and there every such check would fail whatever the
// query selects.

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIR = ".next-prod";
const NEXT_BIN = "node_modules/next/dist/bin/next";
const START_TIMEOUT_MS = 120_000;

/** Sums nothing else in the database could produce, so that a match is this project's budget. */
const BUDGET_AMOUNT = "987654321.87";
const BUDGET_HOURS = "87654321.09";
const VAT_RATE = "STANDARD_21";

const databaseUrl = testDatabaseUrl("e2e");
const serverEnv = { ...process.env, DATABASE_URL: databaseUrl, NEXT_DIST_DIR: DIST_DIR };

function cuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

function sessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

/**
 * The digits of a text, with everything else dropped. A sum travels in many shapes: "987654321.87"
 * in a payload, grouped by a non-breaking space on a page, and that space escaped as a code point
 * in the flight stream. All of them share the same run of digits, so one search finds them all.
 */
function digitsOf(text: string): string {
  return text.replace(/\D+/g, "");
}

type Viewer = { role: string; token: string };
type Fixture = {
  projectId: string;
  projectNumber: string;
  reports: Record<string, string>;
  tag: string;
  viewers: Record<string, Viewer>;
};

async function insertFixture(client: Client): Promise<Fixture> {
  const tag = randomBytes(4).toString("hex").toUpperCase();
  const ids = { customer: cuid(), contractor: cuid(), project: cuid() };
  const projectNumber = `PROD-${tag}`;
  const viewers: Record<string, Viewer> = {};
  const reports: Record<string, string> = {};

  await client.query(
    `INSERT INTO "Customer" (id, type, name, "updatedAt")
     VALUES ($1, 'COMPANY', $2, now())`,
    [ids.customer, `Prod Klant ${tag}`],
  );
  await client.query(`INSERT INTO "Contractor" (id, name, "updatedAt") VALUES ($1, $2, now())`, [
    ids.contractor,
    `Prod Aannemer ${tag}`,
  ]);
  await client.query(
    `INSERT INTO "Project" (id, number, name, "customerId", street, "houseNumber", postcode, city,
       "startDate", "budgetAmount", "vatRate", "budgetHours", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Damrak', 1, '1012 LG', 'Amsterdam', '2026-09-01', $5,
       $6::text::"VatRate", $7, now())`,
    [
      ids.project,
      projectNumber,
      `Prod Project ${tag}`,
      ids.customer,
      BUDGET_AMOUNT,
      VAT_RATE,
      BUDGET_HOURS,
    ],
  );

  for (const [role, organisation] of [
    ["MANAGER", null],
    ["EMPLOYEE", null],
    ["CONTRACTOR", ids.contractor],
  ] as const) {
    const userId = cuid();
    const login = `prod.${role.toLowerCase()}.${tag.toLowerCase()}`;
    const { token, hash } = sessionToken();
    await client.query(
      `INSERT INTO "User" (id, login, "fullName", nickname, role, "passwordHash", "contractorId",
         "updatedAt")
       VALUES ($1, $2, $3, $2, $4::text::"Role", '-', $5, now())`,
      [userId, login, `Prod ${role} ${tag}`, role, organisation],
    );
    await client.query(
      `INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, now() + interval '2 hours')`,
      [cuid(), userId, hash],
    );
    viewers[role] = { role, token };

    // Both workers get a report, so that every page of a report has one of their own to show.
    if (role === "MANAGER") continue;
    const reportId = cuid();
    await client.query(
      `INSERT INTO "WorkReport" (id, "userId", "contractorId", "projectId", "workDate",
         "workDescription", "startMinute", "endMinute", "updatedAt")
       VALUES ($1, $2, $3, $4, '2026-09-02', $5, 480, 720, now())`,
      [reportId, userId, organisation, ids.project, `Prod werk ${tag} ${role}`],
    );
    reports[role] = reportId;
  }

  return { projectId: ids.project, projectNumber, reports, tag, viewers };
}

async function deleteFixture(client: Client, tag: string): Promise<void> {
  await client.query(
    `DELETE FROM "AuditLog" WHERE "actorId" IN (SELECT id FROM "User" WHERE login LIKE $1)`,
    [`prod.%.${tag.toLowerCase()}`],
  );
  await client.query(
    `DELETE FROM "WorkReport" WHERE "projectId" IN (SELECT id FROM "Project" WHERE number = $1)`,
    [`PROD-${tag}`],
  );
  await client.query(`DELETE FROM "Project" WHERE number = $1`, [`PROD-${tag}`]);
  await client.query(
    `DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE login LIKE $1)`,
    [`prod.%.${tag.toLowerCase()}`],
  );
  await client.query(`DELETE FROM "User" WHERE login LIKE $1`, [`prod.%.${tag.toLowerCase()}`]);
  await client.query(`DELETE FROM "Contractor" WHERE name = $1`, [`Prod Aannemer ${tag}`]);
  await client.query(`DELETE FROM "Customer" WHERE name = $1`, [`Prod Klant ${tag}`]);
}

/** The pages that may name a project or a report, for one viewer. */
function pagesOf(fixture: Fixture, role: string): string[] {
  const { projectId, projectNumber, reports, tag } = fixture;
  const pages = [
    "/",
    `/projects?q=${projectNumber}`,
    `/projects/${projectId}`,
    `/projects/${projectId}?tab=reports`,
    `/reports?q=${tag}`,
    "/reports/new",
    `/reports/new?project=${projectId}`,
  ];
  const report = reports[role];
  if (report) pages.push(`/reports/${report}`, `/reports/${report}/edit`);
  return pages;
}

type Failure = { role: string; page: string; kind: string; found: string };

async function readPage(path: string, token: string, rsc: boolean): Promise<string> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(rsc ? { RSC: "1" } : {}),
    },
    redirect: "manual",
  });
  return response.text();
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try {
      const response = await fetch(`${BASE_URL}/login`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The server did not answer on ${BASE_URL} within ${START_TIMEOUT_MS} ms.`);
}

async function main() {
  await prepareTestDatabase(databaseUrl);

  console.log(`Building the application into ${DIST_DIR}…`);
  const build = spawnSync(process.execPath, [NEXT_BIN, "build"], {
    env: serverEnv,
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error(`next build failed with ${build.status}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const fixture = await insertFixture(client);

  const needles = [
    { kind: "budgetAmount", digits: digitsOf(BUDGET_AMOUNT) },
    { kind: "budgetWithVat", digits: digitsOf(budgetWithVat(BUDGET_AMOUNT, VAT_RATE)) },
    { kind: "budgetHours", digits: digitsOf(BUDGET_HOURS) },
  ];

  const server = spawn(process.execPath, [NEXT_BIN, "start", "--port", String(PORT)], {
    env: serverEnv,
    stdio: "inherit",
  });
  const failures: Failure[] = [];
  let checked = 0;

  try {
    await waitForServer(server);
    console.log(
      `Checking the responses of ${BASE_URL} for the budget of ${fixture.projectNumber}…`,
    );

    // The manager's card proves the check itself: the budget is there, in the shape it is looked
    // for, so a silent miss cannot pass for a clean result.
    const managerCard = await readPage(
      `/projects/${fixture.projectId}`,
      fixture.viewers.MANAGER.token,
      false,
    );
    const managerDigits = digitsOf(managerCard);
    for (const needle of needles) {
      if (!managerDigits.includes(needle.digits)) {
        throw new Error(
          `A manager's project card does not show ${needle.kind}: the check would prove nothing.`,
        );
      }
    }

    for (const role of ["EMPLOYEE", "CONTRACTOR"]) {
      const { token } = fixture.viewers[role];
      for (const page of pagesOf(fixture, role)) {
        for (const rsc of [false, true]) {
          const body = await readPage(page, token, rsc);
          const digits = digitsOf(body);
          checked += 1;
          for (const needle of needles) {
            if (digits.includes(needle.digits)) {
              failures.push({ role, page, kind: needle.kind, found: rsc ? "RSC" : "HTML" });
            }
          }
        }
      }
    }
  } finally {
    server.kill();
    await deleteFixture(client, fixture.tag);
    await client.end();
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.role}: ${failure.kind} in the ${failure.found} of ${failure.page}`);
    }
    throw new Error(`The budget leaked into ${failures.length} of ${checked} responses.`);
  }
  console.log(`No budget in ${checked} responses of an employee and a contractor.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
