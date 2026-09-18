import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref, type SearchParamsInput } from "@/components/data-table/search-params";
import { ExportButtons } from "@/components/export/export-buttons";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";
import type { ExportReport } from "@/lib/export";
import { can } from "@/lib/permissions";

import type { ReferenceFilters, ReferenceSection } from "./list-params";
import { ReferenceToolbar, type ReferenceSelectFilter } from "./toolbar";

type ReferenceRegistryProps = {
  section: ReferenceSection;
  viewer: SessionUser;
  report: ExportReport;
  searchParams: SearchParamsInput;
  filters: ReferenceFilters;
  selectFilters?: ReferenceSelectFilter[];
  hasFilters: boolean;
  rowCount: number;
  /** The section's own table, given the message to show when it has no rows. */
  table: (emptyState: React.ReactNode) => React.ReactNode;
};

/** The registry page of a reference book (docs/ТЗ.md, 6.4–6.5), around the section's table. */
export async function ReferenceRegistry({
  section,
  viewer,
  report,
  searchParams,
  filters,
  selectFilters,
  hasFilters,
  rowCount,
  table,
}: ReferenceRegistryProps) {
  const t = await getTranslations();

  const emptyState = hasFilters ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("referenceBooks.list.nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref(`/${section}`, searchParams)}>
          {t("referenceBooks.list.resetFilters")}
        </Link>
      </Button>
    </div>
  ) : rowCount === 0 ? (
    t(`${section}.list.empty`)
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t(`${section}.list.title`)}</h1>
        <div className="flex flex-wrap gap-2">
          {can(viewer, report.permission) && (
            <ExportButtons report={report} searchParams={searchParams} />
          )}
          {can(viewer, `${section}.create`) && (
            <Button asChild>
              <Link href={`/${section}/new`}>
                <PlusIcon aria-hidden />
                {t(`${section}.list.create`)}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ReferenceToolbar
        section={section}
        query={filters.query}
        status={filters.status}
        filters={selectFilters}
      />
      {table(emptyState)}
    </div>
  );
}
