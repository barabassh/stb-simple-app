import type { SearchParamsInput } from "@/components/data-table/search-params";
import type { Role } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { createSession, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { ExportDocument, ExportFormat, ExportReport } from "@/lib/export";
import { prepareExport } from "@/lib/export/service";

import { request } from "./request";

export const PASSWORD = "Secret2026pass";

// One hash for every user: Argon2 is slow on purpose, and the tests do not need different salts.
let passwordHash: Promise<string> | undefined;
let sequence = 0;

type NewUser = {
  login?: string;
  fullName?: string;
  nickname?: string;
  role?: Role;
  isActive?: boolean;
  position?: string;
  email?: string;
  comment?: string;
};

export async function createUser(user: NewUser = {}) {
  sequence += 1;
  passwordHash ??= hashPassword(PASSWORD);
  const login = user.login ?? `user${sequence}`;

  return db.user.create({
    data: {
      login,
      fullName: `Test User ${sequence}`,
      // The login is unique, so it is a free nickname too.
      nickname: login,
      ...user,
      passwordHash: await passwordHash,
    },
    select: { id: true, login: true, fullName: true, role: true },
  });
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

/** Makes the actions called next run for this user, through a real session. */
export async function actAs(user: TestUser) {
  const session = await createSession(user.id, request.ip, request.userAgent);
  request.sessionToken = session.token;
  return session;
}

/** The values the edit form of a user submits unchanged. */
export async function editFormOf(id: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id },
    select: {
      fullName: true,
      nickname: true,
      position: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      comment: true,
    },
  });

  return {
    ...user,
    position: user.position ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    comment: user.comment ?? "",
  };
}

export function auditEntries() {
  return db.auditLog.findMany({ orderBy: [{ at: "asc" }, { id: "asc" }] });
}

/** Every value of every journal entry as text, to look for what must never get there. */
export async function auditLogText(): Promise<string> {
  const rows = await db.$queryRaw<{ entry: string }[]>`
    SELECT row_to_json(a)::text AS entry FROM "AuditLog" a`;
  return rows.map((row) => row.entry).join("\n");
}

export function activeSessions(userId: string) {
  return db.session.findMany({ where: { userId, revokedAt: null } });
}

/** The document of an export the test expects to be made; a refusal fails the test. */
export async function exportDocument(
  actor: SessionUser,
  report: ExportReport,
  searchParams: SearchParamsInput,
  format: ExportFormat = "xlsx",
): Promise<ExportDocument> {
  const prepared = await prepareExport(actor, report, format, searchParams);
  if ("refusal" in prepared) throw new Error(`The export was refused: ${prepared.refusal.error}`);
  return prepared.content;
}
