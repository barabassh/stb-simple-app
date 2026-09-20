"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { PAGE_SIZE_OPTIONS } from "@/components/data-table/search-params";
import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { writeTableSettings } from "@/features/preferences/store";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction, type ActionActor } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { formatCalendarDate } from "@/lib/format";
import { can, PermissionDeniedError, REPORTS_SECTION } from "@/lib/permissions";
import { getClientInfo } from "@/lib/request-info";

import {
  hideableReportColumns,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  REPORT_COLUMNS,
  reportAccess,
  reportColumns,
} from "./columns";
import { reportAuditSnapshot, reportSummaryValues, type ReportAuditRecord } from "./audit";
import { REPORTS_WRITE, reportsWhere } from "./queries";
import {
  ownReportSchema,
  unapproveReportSchema,
  workerReportSchema,
  type OwnReportValues,
} from "./schemas";
import { formatTime } from "./time";
import { isOverlap, lockProjects, revalidateReports, type LockedProject } from "./write";

// Every write into a project runs in one transaction, in this order (docs/АРХИТЕКТУРА.md, 3.10):
// the project row FOR SHARE while it is in progress, the report with a condition on its status,
// the audit entry. Overlapping reports are not looked for before the write: the exclusion
// constraint of the database rejects them, and only then is the report in the way looked up.

const notFound: ActionFailure = { ok: false, error: "reports.errors.notFound" };
const closed: ActionFailure = { ok: false, error: "projects.errors.closed" };
const approved: ActionFailure = { ok: false, error: "reports.errors.approved" };
const approvedNotDeleted: ActionFailure = { ok: false, error: "reports.errors.approvedNotDeleted" };
const changed: ActionFailure = { ok: false, error: "reports.errors.changed" };

const reportIdSchema = z.cuid();

function validationFailure(error: z.ZodError): ActionFailure {
  const failure: ActionFailure & { fieldErrors: Record<string, string[]> } = {
    ok: false,
    fieldErrors: {},
  };
  for (const issue of error.issues) {
    // An unknown key is an issue of the whole form, not of a field.
    if (issue.path.length === 0) failure.error ??= issue.message;
    else (failure.fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
  }
  return failure;
}

/** Called once the input is valid: an invalid request is not worth reading the request for. */
async function auditContext() {
  const [t, request] = await Promise.all([getTranslations(), getClientInfo()]);
  return { t, request };
}

const calendarDate = (isoDate: string) => formatCalendarDate(new Date(`${isoDate}T00:00:00Z`));

/** A report is dated no earlier than the start of its project (docs/ТЗ.md, 7.5). */
function beforeProjectStart(values: OwnReportValues, project: LockedProject): ActionFailure | null {
  if (values.workDate >= project.startDate) return null;
  return {
    ok: false,
    fieldErrors: { workDate: ["reports.errors.beforeProjectStart"] },
    errorValues: { date: calendarDate(project.startDate) },
  };
}

type Worker = {
  id: string;
  fullName: string;
  contractorId: string | null;
  organization: string | null;
};

type WorkerRefusal = "invalid" | "noOrganization" | "organizationArchived";

/**
 * Who may be the worker of a new report (docs/ПРАВА-ДОСТУПА.md, rule 17): an active employee, or
 * an active contractor account of an active organisation. The organisation is kept with the report
 * as it is now; linking the account elsewhere later leaves the report as it was.
 */
async function findWorker(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Worker | WorkerRefusal> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      isActive: true,
      contractor: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!user?.isActive || (user.role !== "EMPLOYEE" && user.role !== "CONTRACTOR")) {
    return "invalid";
  }
  if (user.role === "EMPLOYEE") {
    return { id: user.id, fullName: user.fullName, contractorId: null, organization: null };
  }
  if (!user.contractor) return "noOrganization";
  if (!user.contractor.isActive) return "organizationArchived";
  return {
    id: user.id,
    fullName: user.fullName,
    contractorId: user.contractor.id,
    organization: user.contractor.name,
  };
}

function reportData(values: OwnReportValues) {
  return {
    projectId: values.projectId,
    workDate: new Date(`${values.workDate}T00:00:00Z`),
    workDescription: values.workDescription,
    startMinute: values.startTime,
    endMinute: values.endTime,
    lunchMinutes: values.lunchMinutes,
    mileageKm: values.mileageKm,
  };
}

function formRecord(
  values: OwnReportValues,
  worker: Pick<ReportAuditRecord, "workerName" | "organization">,
  project: LockedProject,
): ReportAuditRecord {
  return {
    ...worker,
    project,
    workDate: values.workDate,
    workDescription: values.workDescription,
    startMinute: values.startTime,
    endMinute: values.endTime,
    lunchMinutes: values.lunchMinutes,
    mileageKm: values.mileageKm,
  };
}

// One relation at most: inside an interactive transaction Prisma reads sibling relations at once
// on the one connection. The project comes from its locked row, the organisation on its own.
const storedReportSelect = {
  userId: true,
  contractorId: true,
  projectId: true,
  status: true,
  user: { select: { fullName: true } },
  workDate: true,
  workDescription: true,
  startMinute: true,
  endMinute: true,
  lunchMinutes: true,
  mileageKm: true,
} as const satisfies Prisma.WorkReportSelect;

type StoredReport = Prisma.WorkReportGetPayload<{ select: typeof storedReportSelect }>;

async function storedRecord(
  tx: Prisma.TransactionClient,
  report: StoredReport,
  project: LockedProject,
): Promise<ReportAuditRecord> {
  const contractor =
    report.contractorId === null
      ? null
      : await tx.contractor.findUniqueOrThrow({
          where: { id: report.contractorId },
          select: { name: true },
        });
  return {
    workerName: report.user.fullName,
    organization: contractor?.name ?? null,
    project,
    workDate: report.workDate.toISOString().slice(0, 10),
    workDescription: report.workDescription,
    startMinute: report.startMinute,
    endMinute: report.endMinute,
    lunchMinutes: report.lunchMinutes,
    mileageKm: report.mileageKm,
  };
}

type ReportOwner = { userId: string } | { reportId: string };

/**
 * The error under "Начало работ" after the database refused an overlapping report
 * (docs/ТЗ.md, 7.6). The report in the way belongs to the same worker, so whoever may write this
 * report may also open that one; its id goes with the values for the link.
 */
async function overlapFailure(values: OwnReportValues, owner: ReportOwner): Promise<ActionFailure> {
  const userId =
    "userId" in owner
      ? owner.userId
      : (
          await db.workReport.findUniqueOrThrow({
            where: { id: owner.reportId },
            select: { userId: true },
          })
        ).userId;

  const other = await db.workReport.findFirst({
    where: {
      userId,
      workDate: new Date(`${values.workDate}T00:00:00Z`),
      deletedAt: null,
      startMinute: { lt: values.endTime },
      endMinute: { gt: values.startTime },
      ...("reportId" in owner ? { id: { not: owner.reportId } } : {}),
    },
    orderBy: { startMinute: "asc" },
    select: { id: true, startMinute: true, endMinute: true, project: { select: { number: true } } },
  });
  // Deleted after it stood in the way: saving again goes through.
  if (!other) return { ok: false, fieldErrors: { startTime: ["reports.errors.overlapGone"] } };

  return {
    ok: false,
    fieldErrors: { startTime: ["reports.errors.overlap"] },
    errorValues: {
      start: formatTime(other.startMinute),
      end: formatTime(other.endMinute),
      number: other.project.number,
      reportId: other.id,
    },
  };
}

async function writing<T extends ActionResult>(
  values: OwnReportValues,
  owner: ReportOwner,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | ActionFailure> {
  try {
    const result = await db.$transaction(write);
    if (result.ok) revalidateReports();
    return result;
  } catch (error) {
    if (isOverlap(error)) return overlapFailure(values, owner);
    throw error;
  }
}

/**
 * Nothing was written by a conditional write: tells a report that is gone from one approved in the
 * meantime. The read comes after the write and decides only the message.
 */
async function refusedWrite(
  tx: Prisma.TransactionClient,
  actor: ActionActor,
  id: string,
  whenApproved: ActionFailure,
): Promise<ActionFailure> {
  const report = await tx.workReport.findFirst({
    where: { id, ...reportsWhere(actor) },
    select: { status: true },
  });
  if (!report) return notFound;
  return report.status === "APPROVED" ? whenApproved : changed;
}

async function fileReport(
  actor: ActionActor,
  userId: string,
  values: OwnReportValues,
  refuse: (refusal: WorkerRefusal) => ActionFailure,
): Promise<ActionResult<{ id: string }>> {
  const { t, request } = await auditContext();

  return writing(values, { userId }, async (tx): Promise<ActionResult<{ id: string }>> => {
    const worker = await findWorker(tx, userId);
    if (typeof worker === "string") return refuse(worker);

    const project = (await lockProjects(tx, [values.projectId])).get(values.projectId);
    if (!project) return closed;
    const early = beforeProjectStart(values, project);
    if (early) return early;

    const { id } = await tx.workReport.create({
      data: {
        userId,
        contractorId: worker.contractorId,
        ...reportData(values),
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true },
    });

    const record = formRecord(
      values,
      { workerName: worker.fullName, organization: worker.organization },
      project,
    );
    await logAudit(tx, {
      ...request,
      actor,
      action: "CREATE",
      entity: "WorkReport",
      entityId: id,
      summary: t("audit.summaries.reportCreated", reportSummaryValues(record)),
      changes: diffEntity(null, {
        ...reportAuditSnapshot(record, t),
        status: t("reports.statuses.UNAPPROVED"),
      }),
    });
    return { ok: true, id };
  });
}

const ownRefusals: Record<WorkerRefusal, ActionFailure> = {
  invalid: { ok: false, error: "errors.forbiddenAction" },
  noOrganization: { ok: false, error: "reports.errors.noOrganization" },
  organizationArchived: { ok: false, error: "reports.errors.organizationArchived" },
};

/** A report of one's own: the worker is always the user who sends it. */
export const createOwnReport = authorizedAction(
  "reports.writeOwn",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    // Naming a worker is refused like a change of role (docs/ПРАВА-ДОСТУПА.md, rule 17).
    if (typeof input === "object" && input !== null && Object.hasOwn(input, "userId")) {
      throw new PermissionDeniedError("reports.write");
    }
    const parsed = ownReportSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    return fileReport(actor, actor.id, parsed.data, (refusal) => ownRefusals[refusal]);
  },
);

const workerRefusals: Record<WorkerRefusal, string> = {
  invalid: "reports.errors.workerInvalid",
  noOrganization: "reports.errors.workerNoOrganization",
  organizationArchived: "reports.errors.workerOrganizationArchived",
};

/** A report an administrator or a manager files for a worker. */
export const createReport = authorizedAction(
  "reports.write",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    const parsed = workerReportSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    return fileReport(actor, parsed.data.userId, parsed.data, (refusal) => ({
      ok: false,
      fieldErrors: { userId: [workerRefusals[refusal]] },
    }));
  },
);

/**
 * The worker of a report never changes, so an edit submits the fields of one's own report
 * whoever makes it. A worker edits only an unapproved report of their own, an administrator or a
 * manager any report, and the approval stays (docs/ТЗ.md, 7.7). The status is a condition of the
 * write: an edit sent after the report was approved is refused.
 */
export const updateReport = authorizedAction(
  REPORTS_WRITE,
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!reportIdSchema.safeParse(id).success) return notFound;
    const parsed = ownReportSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const own = !can(actor, "reports.write");
    const { t, request } = await auditContext();

    return writing(values, { reportId: id }, async (tx): Promise<ActionResult> => {
      const stored = await tx.workReport.findFirst({
        where: { id, ...reportsWhere(actor) },
        select: storedReportSelect,
      });
      if (!stored) return notFound;

      // A report moved to another project leaves one and enters the other: both are in progress.
      const projects = await lockProjects(tx, [stored.projectId, values.projectId]);
      const project = projects.get(values.projectId);
      const storedProject = projects.get(stored.projectId);
      if (!project || !storedProject) return closed;
      const early = beforeProjectStart(values, project);
      if (early) return early;

      const before = await storedRecord(tx, stored, storedProject);
      const after = formRecord(values, before, project);
      const changes = diffEntity(reportAuditSnapshot(before, t), reportAuditSnapshot(after, t));
      // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change.
      if (changes.length === 0)
        return own && stored.status === "APPROVED" ? approved : { ok: true };

      const { count } = await tx.workReport.updateMany({
        where: {
          id,
          deletedAt: null,
          projectId: stored.projectId,
          ...(own ? { userId: actor.id, status: "UNAPPROVED" } : {}),
        },
        data: { ...reportData(values), updatedById: actor.id },
      });
      if (count === 0) return refusedWrite(tx, actor, id, approved);

      await logAudit(tx, {
        ...request,
        actor,
        action: "UPDATE",
        entity: "WorkReport",
        entityId: id,
        summary: t("audit.summaries.reportUpdated", reportSummaryValues(after)),
        changes,
      });
      return { ok: true };
    });
  },
);

/**
 * Deletes an unapproved report softly: it leaves the registries and totals, and the log keeps its
 * entries. An approved report is deleted by nobody; its approval is withdrawn first.
 */
export const deleteReport = authorizedAction(
  REPORTS_WRITE,
  async (actor, id: string): Promise<ActionResult> => {
    if (!reportIdSchema.safeParse(id).success) return notFound;
    const own = !can(actor, "reports.write");
    const { t, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const stored = await tx.workReport.findFirst({
        where: { id, ...reportsWhere(actor) },
        select: storedReportSelect,
      });
      if (!stored) return notFound;
      const project = (await lockProjects(tx, [stored.projectId])).get(stored.projectId);
      if (!project) return closed;

      const { count } = await tx.workReport.updateMany({
        where: {
          id,
          deletedAt: null,
          projectId: stored.projectId,
          status: "UNAPPROVED",
          ...(own ? { userId: actor.id } : {}),
        },
        data: { deletedAt: new Date(), updatedById: actor.id },
      });
      if (count === 0) return refusedWrite(tx, actor, id, own ? approved : approvedNotDeleted);

      await logAudit(tx, {
        ...request,
        actor,
        action: "DELETE",
        entity: "WorkReport",
        entityId: id,
        summary: t(
          "audit.summaries.reportDeleted",
          reportSummaryValues(await storedRecord(tx, stored, project)),
        ),
      });
      return { ok: true };
    });

    if (result.ok) revalidateReports();
    return result;
  },
);

// Approval and its withdrawal (docs/ТЗ.md, 7.7). Like every write into a project they lock its row
// first, and the status of the report is the condition of the write: a second click in another
// tab changes nothing and says so.

const statusChanged: ActionFailure = { ok: false, error: "reports.errors.statusChanged" };
const invalidRequest: ActionFailure = { ok: false, error: "errors.invalidRequest" };

/** One page of the registry at most; the ids are those of the rows ticked on it. */
const reportIdsSchema = z
  .array(z.cuid())
  .min(1)
  .max(PAGE_SIZE_OPTIONS.at(-1) ?? 100);

// One relation at most inside the transaction, as above.
const statusSelect = {
  id: true,
  projectId: true,
  status: true,
  unapprovalReason: true,
  workDate: true,
  user: { select: { fullName: true } },
} as const satisfies Prisma.WorkReportSelect;

type StatusTarget = Prisma.WorkReportGetPayload<{ select: typeof statusSelect }>;

type AuditContext = Awaited<ReturnType<typeof auditContext>>;

function statusSummaryValues(report: StatusTarget, project: LockedProject) {
  return reportSummaryValues({
    workerName: report.user.fullName,
    workDate: report.workDate.toISOString().slice(0, 10),
    project,
  });
}

/** Approves the report if it is still unapproved; false when it was not. */
async function approveOne(
  tx: Prisma.TransactionClient,
  actor: ActionActor,
  report: StatusTarget,
  project: LockedProject,
  { t, request }: AuditContext,
): Promise<boolean> {
  const { count } = await tx.workReport.updateMany({
    where: { id: report.id, deletedAt: null, projectId: project.id, status: "UNAPPROVED" },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: actor.id,
      // The reason of an earlier withdrawal stays in the history only.
      unapprovalReason: null,
      unapprovedAt: null,
      unapprovedById: null,
      updatedById: actor.id,
    },
  });
  if (count === 0) return false;

  await logAudit(tx, {
    ...request,
    actor,
    action: "STATUS_CHANGE",
    entity: "WorkReport",
    entityId: report.id,
    summary: t("audit.summaries.reportApproved", statusSummaryValues(report, project)),
    changes: diffEntity(
      { status: t("reports.statuses.UNAPPROVED"), unapprovalReason: report.unapprovalReason },
      { status: t("reports.statuses.APPROVED"), unapprovalReason: null },
    ),
  });
  return true;
}

async function changeStatus(
  actor: ActionActor,
  id: string,
  change: (
    tx: Prisma.TransactionClient,
    report: StatusTarget,
    project: LockedProject,
  ) => Promise<boolean>,
): Promise<ActionResult> {
  const result = await db.$transaction(async (tx): Promise<ActionResult> => {
    const report = await tx.workReport.findFirst({
      where: { id, ...reportsWhere(actor) },
      select: statusSelect,
    });
    if (!report) return notFound;
    const project = (await lockProjects(tx, [report.projectId])).get(report.projectId);
    if (!project) return closed;

    if (await change(tx, report, project)) return { ok: true };
    const still = await tx.workReport.count({ where: { id, ...reportsWhere(actor) } });
    return still ? statusChanged : notFound;
  });

  if (result.ok) revalidateReports();
  return result;
}

export const approveReport = authorizedAction(
  "reports.approve",
  async (actor, id: string): Promise<ActionResult> => {
    if (!reportIdSchema.safeParse(id).success) return notFound;
    const context = await auditContext();

    return changeStatus(actor, id, (tx, report, project) =>
      approveOne(tx, actor, report, project, context),
    );
  },
);

/**
 * "Утвердить выбранные": approves the reports that are still unapproved when written and whose
 * project is in progress, and skips the rest (docs/ТЗ.md, 7.7). Each approval gets an entry of its
 * own, in the one transaction.
 */
export const approveReports = authorizedAction(
  "reports.approve",
  async (actor, input: unknown): Promise<ActionResult<{ approved: number; skipped: number }>> => {
    const parsed = reportIdsSchema.safeParse(input);
    if (!parsed.success) return invalidRequest;
    const ids = [...new Set(parsed.data)];
    const context = await auditContext();

    const approved = await db.$transaction(async (tx) => {
      const reports = await tx.workReport.findMany({
        where: { AND: [{ id: { in: ids } }, { status: "UNAPPROVED" }, reportsWhere(actor)] },
        select: statusSelect,
        orderBy: { id: "asc" },
      });
      if (reports.length === 0) return 0;
      const projects = await lockProjects(
        tx,
        reports.map((report) => report.projectId),
      );

      let count = 0;
      for (const report of reports) {
        const project = projects.get(report.projectId);
        if (project && (await approveOne(tx, actor, report, project, context))) count += 1;
      }
      return count;
    });

    if (approved > 0) revalidateReports();
    return { ok: true, approved, skipped: ids.length - approved };
  },
);

/**
 * Withdraws the approval with a reason the worker sees until the report is approved again; the
 * worker may then edit and delete it (docs/ТЗ.md, 7.7).
 */
export const unapproveReport = authorizedAction(
  "reports.approve",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!reportIdSchema.safeParse(id).success) return notFound;
    const parsed = unapproveReportSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const { reason } = parsed.data;
    const { t, request } = await auditContext();

    return changeStatus(actor, id, async (tx, report, project) => {
      const { count } = await tx.workReport.updateMany({
        where: { id, deletedAt: null, projectId: project.id, status: "APPROVED" },
        data: {
          status: "UNAPPROVED",
          approvedAt: null,
          approvedById: null,
          unapprovalReason: reason,
          unapprovedAt: new Date(),
          unapprovedById: actor.id,
          updatedById: actor.id,
        },
      });
      if (count === 0) return false;

      await logAudit(tx, {
        ...request,
        actor,
        action: "STATUS_CHANGE",
        entity: "WorkReport",
        entityId: id,
        summary: t("audit.summaries.reportUnapproved", statusSummaryValues(report, project)),
        changes: diffEntity(
          { status: t("reports.statuses.APPROVED"), unapprovalReason: null },
          { status: t("reports.statuses.UNAPPROVED"), unapprovalReason: reason },
        ),
      });
      return true;
    });
  },
);

const reportColumnsSchema = z.array(z.enum(REPORT_COLUMNS)).max(REPORT_COLUMNS.length);

/**
 * The column settings of the reports' tables (docs/ТЗ.md, 7.9). A display setting of the user's
 * own rather than accounting data, so it has no audit entry (docs/СХЕМА-БД.md, 10.2). Columns
 * the role does not see, or may not hide, are dropped.
 */
export const saveReportColumns = authorizedAction(
  REPORTS_SECTION,
  async (actor, input: unknown): Promise<ActionResult> => {
    const parsed = reportColumnsSchema.safeParse(input);
    if (!parsed.success) return invalidRequest;

    const hideable = hideableReportColumns(reportAccess(actor));
    const hidden = [...new Set(parsed.data)].filter((column) => hideable.includes(column));
    await writeTableSettings(actor.id, "reports", { hiddenColumns: hidden });
    revalidateReports();
    return { ok: true };
  },
);

const reportColumnSizesSchema = z.partialRecord(
  z.enum(REPORT_COLUMNS),
  z.number().int().min(MIN_COLUMN_WIDTH).max(MAX_COLUMN_WIDTH),
);

/**
 * The widths the user dragged the reports' columns to, saved when a drag ends (docs/ТЗ.md, 7.9).
 * Like the hidden columns, a display setting without an audit entry. The page is not refreshed:
 * the table already shows the widths.
 */
export const saveReportColumnSizes = authorizedAction(
  REPORTS_SECTION,
  async (actor, input: unknown): Promise<ActionResult> => {
    const parsed = reportColumnSizesSchema.safeParse(input);
    if (!parsed.success) return invalidRequest;

    const visible = reportColumns(reportAccess(actor));
    const columnSizes = Object.fromEntries(
      Object.entries(parsed.data).filter(([column]) => visible.includes(column as never)),
    );
    await writeTableSettings(actor.id, "reports", { columnSizes });
    return { ok: true };
  },
);
