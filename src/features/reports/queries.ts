import type { Prisma } from "@/generated/prisma/client";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can, canAny, PermissionDeniedError, requirePermission } from "@/lib/permissions";

/** Filing and changing reports: of any worker, or only of one's own. */
export const REPORTS_WRITE = ["reports.write", "reports.writeOwn"] as const;

/**
 * The reports a user may see (docs/ПРАВА-ДОСТУПА.md, rule 16): without reports.read only those
 * where the worker is the user. Every query of reports starts from it, so another worker's report,
 * or a deleted one, is simply not found.
 */
export function reportAccessWhere(actor: SessionUser): Prisma.WorkReportWhereInput {
  return can(actor, "reports.read") ? { deletedAt: null } : { deletedAt: null, userId: actor.id };
}

/**
 * Why the user may not file a report of their own: a contractor account files reports on behalf of
 * an active organisation (docs/ТЗ.md, 7.3). Null when nothing stands in the way. The key is the
 * message shown instead of the "Новый отчёт" button and returned by the action that refuses it.
 */
export type OwnReportBlock =
  "reports.errors.noOrganization" | "reports.errors.organizationArchived";

export async function getOwnReportBlock(actor: SessionUser): Promise<OwnReportBlock | null> {
  requirePermission(actor, "reports.writeOwn");
  if (actor.role !== "CONTRACTOR") return null;

  const { contractor } = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { contractor: { select: { isActive: true } } },
  });
  if (!contractor) return "reports.errors.noOrganization";
  return contractor.isActive ? null : "reports.errors.organizationArchived";
}

export type ReportForEdit = {
  id: string;
  status: WorkReportStatus;
  worker: { fullName: string; nickname: string };
  /** Null for the company's own employee. */
  organization: string | null;
  project: { id: string; number: string; name: string; inProgress: boolean };
  /** `yyyy-MM-dd`. */
  workDate: string;
  workDescription: string;
  startMinute: number;
  endMinute: number;
  lunchMinutes: number;
  mileageKm: number;
};

export async function getReportForEdit(
  actor: SessionUser,
  id: string,
): Promise<ReportForEdit | null> {
  if (!canAny(actor, REPORTS_WRITE)) throw new PermissionDeniedError("reports.writeOwn");

  const report = await db.workReport.findFirst({
    where: { id, ...reportAccessWhere(actor) },
    select: {
      id: true,
      status: true,
      user: { select: { fullName: true, nickname: true } },
      contractor: { select: { name: true } },
      project: {
        select: { id: true, number: true, name: true, status: true, deletedAt: true },
      },
      workDate: true,
      workDescription: true,
      startMinute: true,
      endMinute: true,
      lunchMinutes: true,
      mileageKm: true,
    },
  });
  if (!report) return null;

  const { user, contractor, project, workDate, ...rest } = report;
  return {
    ...rest,
    worker: user,
    organization: contractor?.name ?? null,
    project: {
      id: project.id,
      number: project.number,
      name: project.name,
      inProgress: project.status === "IN_PROGRESS" && project.deletedAt === null,
    },
    workDate: workDate.toISOString().slice(0, 10),
  };
}

export type ReportWorkerOption = {
  id: string;
  fullName: string;
  nickname: string;
  /** Null for the company's own employee. */
  organization: string | null;
};

/**
 * The workers an administrator or a manager may file a report for (docs/ТЗ.md, 7.2): active
 * employees, and active contractor accounts of an active organisation. The action checks the
 * choice again.
 */
export async function listReportWorkerOptions(actor: SessionUser): Promise<ReportWorkerOption[]> {
  requirePermission(actor, "reports.write");

  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "EMPLOYEE" }, { role: "CONTRACTOR", contractor: { isActive: true } }],
    },
    select: { id: true, fullName: true, nickname: true, contractor: { select: { name: true } } },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });

  return users.map(({ contractor, ...user }) => ({
    ...user,
    organization: contractor?.name ?? null,
  }));
}
