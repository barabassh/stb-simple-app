import { getLocale, getTranslations } from "next-intl/server";

import { defineExportReport, type ExportColumn, type ExportRow } from "@/lib/export";
import { formatAddress } from "@/lib/nl/address";

import { projectAccess, projectColumns, type ProjectColumn } from "./columns";
import { parseProjectsListParams } from "./list-params";
import { listProjectsForExport, type ProjectListItem } from "./queries";

type ProjectExportRow = Record<ProjectColumn, ExportRow[string]>;

const FORMATS: Partial<Record<ProjectColumn, ExportColumn["format"]>> = {
  startDate: "date",
  duration: "number",
  budgetAmount: "money",
  budgetWithVat: "money",
  budgetHours: "number",
  updatedAt: "datetime",
};

// Sums go to the file as numbers so that they can be added up (docs/ТЗ.md, 6.12, 17). A double
// holds every amount up to 999 999 999 999,99 to the cent; nothing is calculated with it here.
const toNumber = (value: string | null | undefined) => (value == null ? null : Number(value));

/** The columns the registry shows the reader, plus the VAT rate and the total (docs/ТЗ.md, 6.8). */
export const projectsExport = defineExportReport<ProjectExportRow>({
  name: "projects",
  path: "/projects",
  permission: "projects.export",
  entity: "Project",
  async load(actor, searchParams) {
    const access = projectAccess(actor);
    const [t, locale, projects] = await Promise.all([
      getTranslations("projects"),
      getLocale(),
      listProjectsForExport(actor, parseProjectsListParams(searchParams, access)),
    ]);

    const header = (column: ProjectColumn) =>
      t.has(`export.columns.${column}`) ? t(`export.columns.${column}`) : t(`columns.${column}`);

    const row = (project: ProjectListItem): ProjectExportRow => ({
      number: project.number,
      name: project.name,
      customer: project.customer?.name ?? null,
      address: formatAddress(project.address, locale),
      startDate: project.startDate,
      duration: project.duration ?? t("notStarted"),
      status: project.status ? t(`statuses.${project.status}`) : null,
      budgetAmount: toNumber(project.budget?.amount),
      vatRate: project.budget?.vatRate ? t(`vatRates.${project.budget.vatRate}`) : null,
      budgetWithVat: toNumber(project.budget?.amountWithVat),
      budgetHours: toNumber(project.budget?.hours),
      updatedAt: project.updatedAt ?? null,
    });

    return {
      title: t("export.title"),
      columns: projectColumns(access, "export").map((column) => ({
        key: column,
        header: header(column),
        format: FORMATS[column],
      })),
      rows: projects.map(row),
    };
  },
});
