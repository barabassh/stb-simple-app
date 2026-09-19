import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatNumber } from "@/lib/format";

import type { ParticipantGroup, ParticipantTotals } from "../queries";
import { formatHours } from "../time";

type ProjectParticipantsProps = {
  groups: ParticipantGroup[];
  /** Whether the worker links to their account's card (users.read). */
  userLinks: boolean;
};

/** The "Участники" tab of a project card (docs/ТЗ.md, 7.11). */
export function ProjectParticipants({ groups, userLinks }: ProjectParticipantsProps) {
  const t = useTranslations();

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t("reports.participants.empty")}
      </p>
    );
  }

  const organizationName = ({ organization }: ParticipantGroup) =>
    !organization
      ? t("reports.form.ourCompany")
      : organization.isActive
        ? organization.name
        : t("referenceBooks.archivedMark", { name: organization.name });

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("reports.participants.columns.worker")}</TableHead>
            <TableHead className="text-right">
              {t("reports.participants.columns.reports")}
            </TableHead>
            <TableHead className="text-right">
              {t("reports.participants.columns.approvedHours")}
            </TableHead>
            <TableHead className="text-right">{t("reports.participants.columns.hours")}</TableHead>
            <TableHead className="text-right">
              {t("reports.participants.columns.mileageKm")}
            </TableHead>
            <TableHead>{t("reports.participants.columns.lastWorkDate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const name = organizationName(group);
            return (
              <Fragment key={group.organization?.id ?? ""}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={6} className="font-medium whitespace-normal">
                    {name}
                  </TableCell>
                </TableRow>
                {group.participants.map((participant) => (
                  <TableRow key={participant.worker.id}>
                    <TableCell>
                      <div className="flex max-w-64 min-w-40 flex-col whitespace-normal">
                        {userLinks ? (
                          <Link
                            href={`/users/${participant.worker.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {participant.worker.fullName}
                          </Link>
                        ) : (
                          <span className="font-medium">{participant.worker.fullName}</span>
                        )}
                        <span className="text-muted-foreground">{participant.worker.nickname}</span>
                      </div>
                    </TableCell>
                    <TotalsCells totals={participant} />
                  </TableRow>
                ))}
                <TableRow className="font-medium hover:bg-transparent">
                  <TableCell className="whitespace-normal">
                    {t("reports.participants.groupTotal", { organization: name })}
                  </TableCell>
                  <TotalsCells totals={group.totals} />
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TotalsCells({ totals }: { totals: ParticipantTotals }) {
  return (
    <>
      <TableCell className="text-right">{formatNumber(totals.reports)}</TableCell>
      <TableCell className="text-right">{formatHours(totals.approvedMinutes)}</TableCell>
      <TableCell className="text-right">{formatHours(totals.minutes)}</TableCell>
      <TableCell className="text-right">{formatNumber(totals.mileageKm)}</TableCell>
      <TableCell>{formatCalendarDate(totals.lastWorkDate)}</TableCell>
    </>
  );
}
