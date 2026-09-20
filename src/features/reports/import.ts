import { getTranslations } from "next-intl/server";

import type { Prisma } from "@/generated/prisma/client";
import { diffEntity, logAuditMany } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatCalendarDate } from "@/lib/format";
import {
  defineImport,
  ImportStale,
  type ImportMessage,
  type ImportOptions,
  type ImportRowCells,
  type ImportTexts,
  type ImportWriteContext,
  type ParsedRow,
  type RowResult,
} from "@/lib/import";

import { reportAuditSnapshot, reportSummaryValues, type ReportAuditRecord } from "./audit";
import { findOverlaps, type ReportInterval } from "./overlap";
import { importedReportSchema, type ImportedReportValues } from "./schemas";
import { formatHours, formatTime, workedMinutes } from "./time";
import { isOverlap, lockProjects, revalidateReports, REPORTS_PATH } from "./write";

// The import of work reports (docs/ТЗ.md, 7.13): a row names its worker by nickname and its
// project by the name of a project in progress, is checked by the rules of the form, and is written
// only together with every other row of the file.

/** The option of the confirmation: the imported reports are approved at once. */
const APPROVE_OPTION = "approve";

export type ReportImportRow = {
  workDate: string;
  nickname: string;
  project: string;
  workDescription: string;
  startTime: string;
  endTime: string;
  lunchMinutes: string;
  mileageKm: string;
};

type ImportedProject = { id: string; number: string; name: string; startDate: string };

type ImportedWorker = {
  id: string;
  fullName: string;
  nickname: string;
  contractorId: string | null;
  organization: string | null;
};

export type ReadyReport = {
  rowNumber: number;
  worker: ImportedWorker;
  project: ImportedProject;
  values: ImportedReportValues;
};

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const message = (key: string, values?: ImportMessage["values"]): ImportMessage => ({ key, values });

const calendarDate = (isoDate: string) => formatCalendarDate(new Date(`${isoDate}T00:00:00Z`));

/** Which column a message of the form's rules belongs to, for the heading before it. */
const COLUMN_OF_FIELD: Partial<Record<string, keyof ReportImportRow>> = {
  workDate: "workDate",
  workDescription: "workDescription",
  startTime: "startTime",
  endTime: "endTime",
  lunchMinutes: "lunchMinutes",
  mileageKm: "mileageKm",
};

async function texts(): Promise<ImportTexts<ReportImportRow>> {
  const t = await getTranslations("reports.import");

  return {
    title: t("sheet"),
    columns: [
      { key: "workDate", header: t("columns.workDate"), type: "date", required: true },
      { key: "nickname", header: t("columns.nickname"), type: "text", required: true },
      { key: "project", header: t("columns.project"), type: "text", required: true, width: 28 },
      {
        key: "workDescription",
        header: t("columns.workDescription"),
        type: "text",
        required: true,
        width: 40,
      },
      { key: "startTime", header: t("columns.startTime"), type: "time", required: true },
      { key: "endTime", header: t("columns.endTime"), type: "time", required: true },
      { key: "lunchMinutes", header: t("columns.lunchMinutes"), type: "integer" },
      { key: "mileageKm", header: t("columns.mileageKm"), type: "integer" },
    ],
    instructions: t.raw("instructions") as string[],
    example: {
      workDate: t("example.workDate"),
      nickname: t("example.nickname"),
      project: t("example.project"),
      workDescription: t("example.workDescription"),
      startTime: "08:00",
      endTime: "16:30",
      lunchMinutes: "30",
      mileageKm: "42",
    },
    columnsOfPreview: [
      { key: "workDate", header: t("columns.workDate") },
      { key: "worker", header: t("preview.worker") },
      { key: "project", header: t("preview.project") },
      { key: "time", header: t("preview.time") },
      { key: "lunchMinutes", header: t("columns.lunchMinutes") },
      { key: "hours", header: t("preview.hours") },
      { key: "mileageKm", header: t("columns.mileageKm") },
      { key: "workDescription", header: t("columns.workDescription"), wrap: true },
    ],
  };
}

const workedMinutesOf = (values: ImportedReportValues) =>
  workedMinutes({
    startMinute: values.startTime,
    endMinute: values.endTime,
    lunchMinutes: values.lunchMinutes,
  });

/** What the preview shows of a row: the found records where they were found, the file's text else. */
function previewCells(
  row: ParsedRow<ReportImportRow>,
  found: { worker?: ImportedWorker; project?: ImportedProject; values?: ImportedReportValues },
  t: Translate,
  ourCompany: string,
): ImportRowCells {
  const { values } = row;
  const time =
    found.values && `${formatTime(found.values.startTime)}–${formatTime(found.values.endTime)}`;
  // A cell is shown as the application writes it as soon as it was read; an error elsewhere in the
  // row leaves the other cells readable.
  const readDate = !row.cellErrors.workDate && values.workDate !== "";

  return {
    workDate: readDate ? calendarDate(values.workDate) : values.workDate,
    worker: found.worker
      ? t("reports.import.preview.workerValue", {
          fullName: found.worker.fullName,
          nickname: found.worker.nickname,
          organization: found.worker.organization ?? ourCompany,
        })
      : values.nickname,
    project: found.project
      ? t("reports.import.preview.projectValue", {
          number: found.project.number,
          name: found.project.name,
        })
      : values.project,
    time: time ?? `${values.startTime}–${values.endTime}`,
    lunchMinutes: found.values ? String(found.values.lunchMinutes) : values.lunchMinutes,
    hours: found.values ? formatHours(workedMinutesOf(found.values)) : "",
    mileageKm: found.values ? String(found.values.mileageKm) : values.mileageKm,
    workDescription: values.workDescription,
  };
}

/** Why a found worker may still not be the worker of a report (docs/ПРАВА-ДОСТУПА.md, rule 17). */
function workerRefusal(user: {
  role: string;
  isActive: boolean;
  contractor: { isActive: boolean } | null;
}): string | null {
  if (!user.isActive || (user.role !== "EMPLOYEE" && user.role !== "CONTRACTOR")) {
    return "reports.errors.workerInvalid";
  }
  if (user.role !== "CONTRACTOR") return null;
  if (!user.contractor) return "reports.errors.workerNoOrganization";
  return user.contractor.isActive ? null : "reports.errors.workerOrganizationArchived";
}

/** Nicknames and project names are matched without regard to case (docs/ТЗ.md, 7.13). */
async function findRecords(rows: ParsedRow<ReportImportRow>[]) {
  const nicknames = [...new Set(rows.map((row) => row.values.nickname).filter(Boolean))];
  const names = [...new Set(rows.map((row) => row.values.project).filter(Boolean))];

  const [users, projects] = await Promise.all([
    nicknames.length === 0
      ? []
      : db.user.findMany({
          where: { nickname: { in: nicknames, mode: "insensitive" } },
          select: {
            id: true,
            fullName: true,
            nickname: true,
            role: true,
            isActive: true,
            contractor: { select: { id: true, name: true, isActive: true } },
          },
        }),
    names.length === 0
      ? []
      : db.project.findMany({
          where: {
            name: { in: names, mode: "insensitive" },
            status: "IN_PROGRESS",
            deletedAt: null,
          },
          select: { id: true, number: true, name: true, startDate: true },
        }),
  ]);

  return {
    users: new Map(users.map((user) => [user.nickname.toLowerCase(), user])),
    projects: new Map(
      projects.map((project) => [
        project.name.toLowerCase(),
        {
          id: project.id,
          number: project.number,
          name: project.name,
          startDate: project.startDate.toISOString().slice(0, 10),
        },
      ]),
    ),
  };
}

type Candidate = ReadyReport & { index: number };

/** The reports of the same workers on the same days, to find the rows that overlap them. */
async function findExistingReports(candidates: Candidate[]) {
  if (candidates.length === 0) return [];

  return db.workReport.findMany({
    where: {
      deletedAt: null,
      userId: { in: [...new Set(candidates.map((row) => row.worker.id))] },
      workDate: {
        in: [...new Set(candidates.map((row) => `${row.values.workDate}T00:00:00Z`))].map(
          (date) => new Date(date),
        ),
      },
    },
    select: {
      id: true,
      userId: true,
      workDate: true,
      startMinute: true,
      endMinute: true,
      project: { select: { number: true } },
    },
  });
}

async function check(rows: ParsedRow<ReportImportRow>[]): Promise<RowResult<ReadyReport>[]> {
  const [t, records] = await Promise.all([getTranslations(), findRecords(rows)]);
  const ourCompany = t("reports.form.ourCompany");

  const results: RowResult<ReadyReport>[] = [];
  const candidates: Candidate[] = [];

  rows.forEach((row, index) => {
    const errors: ImportMessage[] = [];
    for (const [column, key] of Object.entries(row.cellErrors)) {
      if (key) errors.push({ key, column });
    }

    const user = row.values.nickname
      ? records.users.get(row.values.nickname.toLowerCase())
      : undefined;
    if (!row.cellErrors.nickname) {
      if (!user) {
        errors.push({ ...message("reports.import.errors.workerNotFound"), column: "nickname" });
      } else {
        const refusal = workerRefusal(user);
        if (refusal) errors.push({ key: refusal, column: "nickname" });
      }
    }

    const project = row.values.project
      ? records.projects.get(row.values.project.toLowerCase())
      : undefined;
    if (!project && !row.cellErrors.project) {
      errors.push({ ...message("reports.import.errors.projectNotFound"), column: "project" });
    }

    const parsed = importedReportSchema.safeParse({
      ...row.values,
      // An empty cell of these columns is a zero (docs/ТЗ.md, 7.13).
      lunchMinutes: row.values.lunchMinutes || "0",
      mileageKm: row.values.mileageKm || "0",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = COLUMN_OF_FIELD[String(issue.path[0])];
        // A cell that is not of its column's type has been named already.
        if (column && row.cellErrors[column]) continue;
        errors.push({ key: issue.message, column });
      }
    }

    const values = parsed.success ? parsed.data : undefined;
    if (values && project && values.workDate < project.startDate) {
      errors.push({
        ...message("reports.errors.beforeProjectStart", {
          date: calendarDate(project.startDate),
        }),
        column: "workDate",
      });
    }

    const worker: ImportedWorker | undefined =
      user && workerRefusal(user) === null
        ? {
            id: user.id,
            fullName: user.fullName,
            nickname: user.nickname,
            contractorId: user.contractor?.id ?? null,
            organization: user.contractor?.name ?? null,
          }
        : undefined;
    const cells = previewCells(row, { worker, project, values }, t, ourCompany);

    if (errors.length > 0 || !worker || !project || !values) {
      results.push({ rowNumber: row.rowNumber, cells, errors });
      return;
    }
    // Checked for overlaps once every row is known: rows overlap each other as well.
    const ready: ReadyReport = { rowNumber: row.rowNumber, worker, project, values };
    candidates.push({ ...ready, index });
    results.push({ rowNumber: row.rowNumber, cells, ready });
  });

  const existing = await findExistingReports(candidates);
  const intervals: ReportInterval[] = candidates.map((row) => ({
    userId: row.worker.id,
    workDate: row.values.workDate,
    startMinute: row.values.startTime,
    endMinute: row.values.endTime,
  }));
  const stored: (ReportInterval & { id: string; number: string })[] = existing.map((report) => ({
    id: report.id,
    userId: report.userId,
    workDate: report.workDate.toISOString().slice(0, 10),
    startMinute: report.startMinute,
    endMinute: report.endMinute,
    number: report.project.number,
  }));

  findOverlaps(intervals, stored).forEach((overlaps, position) => {
    const errors: ImportMessage[] = [];
    for (const report of overlaps.existing) {
      errors.push({
        key: "reports.errors.overlap",
        values: {
          start: formatTime(report.startMinute),
          end: formatTime(report.endMinute),
          number: report.number,
        },
        column: "startTime",
        href: `${REPORTS_PATH}/${report.id}`,
      });
    }
    if (overlaps.rows.length > 0) {
      errors.push({
        key: "reports.import.errors.overlapRow",
        values: {
          count: overlaps.rows.length,
          rows: overlaps.rows.map((other) => candidates[other].rowNumber).join(", "),
        },
        column: "startTime",
      });
    }
    if (errors.length === 0) return;

    const { index } = candidates[position];
    results[index] = { rowNumber: results[index].rowNumber, cells: results[index].cells, errors };
  });

  return results;
}

const reportKey = (userId: string, workDate: string, startMinute: number) =>
  `${userId}|${workDate}|${startMinute}`;

/**
 * Writes every row of the file, or nothing: the projects are locked in progress first, and the
 * exclusion constraint of the database refuses a row that overlaps a report written in the
 * meantime — both leave the import to be checked again (docs/ТЗ.md, 7.13).
 */
async function write(
  tx: Prisma.TransactionClient,
  ready: ReadyReport[],
  { actor, options, fileName, request }: ImportWriteContext,
): Promise<void> {
  const t = await getTranslations();
  const projects = await lockProjects(
    tx,
    ready.map((row) => row.project.id),
  );
  for (const row of ready) {
    const project = projects.get(row.project.id);
    if (!project || row.values.workDate < project.startDate) throw new ImportStale();
  }

  const approved = options[APPROVE_OPTION] === true;
  const now = new Date();
  const status = approved ? "APPROVED" : "UNAPPROVED";

  let created;
  try {
    created = await tx.workReport.createManyAndReturn({
      data: ready.map((row) => ({
        userId: row.worker.id,
        contractorId: row.worker.contractorId,
        projectId: row.project.id,
        workDate: new Date(`${row.values.workDate}T00:00:00Z`),
        workDescription: row.values.workDescription,
        startMinute: row.values.startTime,
        endMinute: row.values.endTime,
        lunchMinutes: row.values.lunchMinutes,
        mileageKm: row.values.mileageKm,
        status,
        ...(approved ? { approvedAt: now, approvedById: actor.id } : {}),
        createdById: actor.id,
        updatedById: actor.id,
      })),
      select: { id: true, userId: true, workDate: true, startMinute: true },
    });
  } catch (error) {
    if (isOverlap(error)) throw new ImportStale();
    throw error;
  }

  // A worker has one report at a time of a day, so that names the row a written report came from.
  const idOf = new Map(
    created.map((report) => [
      reportKey(report.userId, report.workDate.toISOString().slice(0, 10), report.startMinute),
      report.id,
    ]),
  );

  await logAuditMany(
    tx,
    ready.map((row) => {
      const record: ReportAuditRecord = {
        workerName: row.worker.fullName,
        organization: row.worker.organization,
        project: row.project,
        workDate: row.values.workDate,
        workDescription: row.values.workDescription,
        startMinute: row.values.startTime,
        endMinute: row.values.endTime,
        lunchMinutes: row.values.lunchMinutes,
        mileageKm: row.values.mileageKm,
      };
      return {
        ...request,
        actor,
        action: "CREATE" as const,
        entity: "WorkReport" as const,
        entityId: idOf.get(reportKey(row.worker.id, row.values.workDate, row.values.startTime)),
        summary: t("audit.summaries.reportImported", {
          ...reportSummaryValues(record),
          file: fileName,
        }),
        changes: diffEntity(null, {
          ...reportAuditSnapshot(record, t),
          status: t(`reports.statuses.${status}`),
        }),
      };
    }),
  );
}

async function summary({
  fileName,
  count,
  options,
}: {
  fileName: string;
  count: number;
  options: ImportOptions;
}): Promise<string> {
  const t = await getTranslations("audit.summaries");
  const key = options[APPROVE_OPTION] ? "reportsImportedApproved" : "reportsImported";
  return t(key, { file: fileName, count });
}

export const reportsImport = defineImport<ReportImportRow, ReadyReport>({
  name: "reports",
  permission: "reports.import",
  entity: "WorkReport",
  options: [APPROVE_OPTION],
  texts,
  check,
  write,
  summary,
  revalidate: revalidateReports,
});
