"use client";

import { BadgeCheckIcon, BadgeIcon, MessageSquareWarningIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import { formatDateTime, formatShortName } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      {unapproval && <UnapprovalMark unapproval={unapproval} />}
    </span>
  );
}

/**
 * The status in a table row as an icon, a badge with a tick when approved and without one while it
 * waits (docs/ТЗ.md, 7.9): the word is in the tooltip and read out by a screen reader. The tooltip
 * also opens on a tap, as a phone never hovers.
 */
export function ReportStatusIcon({ status, unapproval }: ReportStatusBadgeProps) {
  const t = useTranslations("reports");
  const [open, setOpen] = useState(false);
  const label = t(`statuses.${status}`);
  const approved = status === "APPROVED";
  const Icon = approved ? BadgeCheckIcon : BadgeIcon;

  // A tap is how a phone asks for the tooltip. Radix opens it on the focus a tap gives, then closes
  // it on the click and again as the finger lifts, as a touch pointer leaves once it is up. So the
  // click sets the opposite of what was shown when the pointer went down, and the leave is ignored.
  const openAtPress = useRef(false);
  const press = () => {
    openAtPress.current = open;
  };
  const toggle = (event: MouseEvent) => {
    event.preventDefault();
    setOpen(!openAtPress.current);
    openAtPress.current = !openAtPress.current;
  };
  const keepAfterTouch = (event: PointerEvent) => {
    if (event.pointerType === "touch") event.preventDefault();
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onPointerDown={press}
            onClick={toggle}
            onPointerLeave={keepAfterTouch}
          >
            <Icon
              aria-hidden
              className={cn(
                "size-5",
                approved
                  ? "fill-emerald-100 text-emerald-600 dark:fill-emerald-950 dark:text-emerald-400"
                  : "fill-amber-50 text-amber-500 dark:fill-amber-950 dark:text-amber-400",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {unapproval && <UnapprovalMark unapproval={unapproval} />}
    </span>
  );
}

/** Opens the reason on a tap as well as a click, for the same reason. */
function UnapprovalMark({ unapproval }: { unapproval: NonNullable<ReportListItem["unapproval"]> }) {
  const t = useTranslations("reports");

  return (
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
