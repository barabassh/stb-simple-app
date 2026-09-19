"use client";

import { MessageSquareWarningIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import { formatDateTime, formatShortName } from "@/lib/format";

import type { ReportListItem } from "../queries";

type ReportStatusBadgeProps = {
  status: WorkReportStatus;
  /** Shown as a mark next to the status while the report waits to be approved again. */
  unapproval?: ReportListItem["unapproval"];
};

/**
 * The status of a report, with a mark whose reason opens on a tap as well as a click: workers read
 * the registry on a phone, where a hover tooltip never shows (docs/ТЗ.md, 7.7).
 */
export function ReportStatusBadge({ status, unapproval }: ReportStatusBadgeProps) {
  const t = useTranslations("reports");

  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={status === "APPROVED" ? "secondary" : "outline"}>
        {t(`statuses.${status}`)}
      </Badge>
      {unapproval && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-amber-600 dark:text-amber-400"
              aria-label={t("card.unapprovedMark")}
            >
              <MessageSquareWarningIcon aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 text-sm break-words whitespace-normal">
            <UnapprovalText unapproval={unapproval} />
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** "Утверждение снято: дата, автор — причина". */
export function UnapprovalText({
  unapproval,
}: {
  unapproval: NonNullable<ReportListItem["unapproval"]>;
}) {
  const t = useTranslations("reports.card");
  const date = formatDateTime(unapproval.at);
  const { by, reason } = unapproval;

  return by
    ? t("unapprovedBy", {
        date,
        author: formatShortName(by.fullName).replaceAll(" ", "\u00A0"),
        reason,
      })
    : t("unapproved", { date, reason });
}
