import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import {
  readParam,
  TAB_SEARCH_PARAM,
  type SearchParamsInput,
} from "@/components/data-table/search-params";
import { UrlTabs } from "@/components/url-tabs";
import { AuditTable } from "@/features/audit/components/audit-table";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { ReferenceCardActions } from "./card-actions";
import type { ReferenceSection } from "./list-params";
import type { ChangeReferenceStatus } from "./status-dialog";
import { ReferenceStatusBadge } from "./status-badge";

type Stamp = { fullName: string; login: string } | null;

export type ReferenceCardRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: Stamp;
  updatedBy: Stamp;
};

type ReferenceTab = { value: string; label: string; content: React.ReactNode };

type ReferenceCardProps = {
  section: ReferenceSection;
  entity: "Customer" | "Contractor";
  viewer: SessionUser;
  record: ReferenceCardRecord;
  /** A line under the name, such as the kind of customer. */
  subtitle?: string;
  changeStatus: ChangeReferenceStatus;
  searchParams: SearchParamsInput;
  /** "Сведения", which opens by default. */
  details: React.ReactNode;
  /** The section's own tabs between the details and the history. */
  tabs: ReferenceTab[];
};

const DETAILS_TAB = "details";

/** The card of a customer or a contractor (docs/ТЗ.md, 6.4–6.5); the history is its last tab. */
export async function ReferenceCard({
  section,
  entity,
  viewer,
  record,
  subtitle,
  changeStatus,
  searchParams,
  details,
  tabs,
}: ReferenceCardProps) {
  const historyTable = parseAuditTableState(searchParams);
  const [history, t] = await Promise.all([
    can(viewer, `${section}.history`)
      ? listEntityAuditLogs(viewer, entity, record.id, historyTable)
      : null,
    getTranslations(),
  ]);

  const allTabs = [
    { value: DETAILS_TAB, label: t("referenceBooks.card.tabs.details"), content: details },
    ...tabs,
    ...(history
      ? [
          {
            value: "history",
            label: t("referenceBooks.card.tabs.history"),
            content: (
              <AuditTable
                rows={history.rows}
                rowCount={history.rowCount}
                state={historyTable}
                emptyState={t("audit.historyEmpty")}
                showEntity={false}
                showRequestInfo={can(viewer, "audit.read")}
              />
            ),
          },
        ]
      : []),
  ];

  const requestedTab = readParam(searchParams, TAB_SEARCH_PARAM);
  const tab = allTabs.find(({ value }) => value === requestedTab)?.value ?? DETAILS_TAB;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/${section}`} label={t(`${section}.form.backToList`)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold break-words sm:text-2xl">
            {record.name}
            <ReferenceStatusBadge isActive={record.isActive} />
          </h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          <RecordStamps
            created={{ at: record.createdAt, by: record.createdBy }}
            updated={{ at: record.updatedAt, by: record.updatedBy }}
          />
        </div>
        <ReferenceCardActions
          section={section}
          target={{ id: record.id, name: record.name, isActive: record.isActive }}
          changeStatus={changeStatus}
          viewer={viewer}
        />
      </div>

      <UrlTabs value={tab} defaultValue={DETAILS_TAB} tabs={allTabs} />
    </div>
  );
}
