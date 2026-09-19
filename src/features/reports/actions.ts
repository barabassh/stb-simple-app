"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction, type ActionActor } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { formatCalendarDate } from "@/lib/format";
import { can, PermissionDeniedError } from "@/lib/permissions";
import { getClientInfo } from "@/lib/request-info";

import { reportAuditSnapshot, reportSummaryValues, type ReportAuditRecord } from "./audit";
import { REPORTS_WRITE, reportAccessWhere } from "./queries";
import { ownReportSchema, workerReportSchema, type OwnReportValues } from "./schemas";
import { formatTime } from "./time";

// Every write into a project runs in one transaction, in this order (docs/АРХИТЕКТУРА.md, 3.10):
// the project row FOR SHARE while it is in progress, the report with a condition on its status,
// the audit entry. Overlapping reports are not looked for before the write: the exclusion
// constraint of the database rejects them, and only then is the report in the way looked up.

const REPORTS_PATH = "/reports";

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

type LockedProject = { id: string; number: string; name: string; startDate: string };

/**
 * Takes the rows of the projects FOR SHARE while they are in progress. Closing a project updates
 * its row, so it waits for this transaction and then counts the report written here; a project
 * closed first is missing from the result. The only SQL the report actions write themselves:
 * Prisma does not lock rows.
 */
async function lockProjects(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, LockedProject>> {
  const rows = await tx.$queryRaw<LockedProject[]>`
    SELECT id, number, name, to_char("startDate", 'YYYY-MM-DD') AS "startDate"
    FROM "Project"
    WHERE id IN (${Prisma.join([...new Set(ids)])})
      AND status = 'IN_PROGRESS' AND "deletedAt" IS NULL
    ORDER BY id
    FOR SHARE`;
  return new Map(rows.map((row) => [row.id, row]));
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

/** Only one exclusion constraint guards reports: WorkReport_no_overlap. */
function isOverlap(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = (
    error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined
  )?.cause;
  return cause?.originalCode === "23P01";
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
    if (result.ok) revalidatePath(REPORTS_PATH, "layout");
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
    where: { id, ...reportAccessWhere(actor) },
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
        where: { id, ...reportAccessWhere(actor) },
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
        where: { id, ...reportAccessWhere(actor) },
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

    if (result.ok) revalidatePath(REPORTS_PATH, "layout");
    return result;
  },
);
