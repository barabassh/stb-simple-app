import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";

// What every write of a report shares (docs/АРХИТЕКТУРА.md, 3.10). It lives apart from actions.ts
// because a module of "use server" exports server actions only, and the import needs the same
// locking and the same reading of the database's refusals.

export const REPORTS_PATH = "/reports";

/** The registry, the report pages and the "Отчёты" tab with the totals of a project card. */
export function revalidateReports(): void {
  revalidatePath(REPORTS_PATH, "layout");
  revalidatePath("/projects/[id]", "page");
}

export type LockedProject = { id: string; number: string; name: string; startDate: string };

/**
 * Takes the rows of the projects FOR SHARE while they are in progress. Closing a project updates
 * its row, so it waits for this transaction and then counts the report written here; a project
 * closed first is missing from the result. The only SQL the writes of reports do themselves:
 * Prisma does not lock rows.
 */
export async function lockProjects(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, LockedProject>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const rows = await tx.$queryRaw<LockedProject[]>`
    SELECT id, number, name, to_char("startDate", 'YYYY-MM-DD') AS "startDate"
    FROM "Project"
    WHERE id IN (${Prisma.join(unique)})
      AND status = 'IN_PROGRESS' AND "deletedAt" IS NULL
    ORDER BY id
    FOR SHARE`;
  return new Map(rows.map((row) => [row.id, row]));
}

/** Only one exclusion constraint guards reports: WorkReport_no_overlap. */
export function isOverlap(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = (
    error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined
  )?.cause;
  return cause?.originalCode === "23P01";
}
