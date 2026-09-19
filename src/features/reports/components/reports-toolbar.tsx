"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useOptimistic, useTransition } from "react";

import {
  useDebouncedFilter,
  useFilterNavigation,
} from "@/components/data-table/use-filter-navigation";
import { RecordPicker, type RecordOption } from "@/components/reference-book/record-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ReportFilterOptions } from "../queries";
import {
  REPORT_STATUS_FILTERS,
  REPORTS_SEARCH_PARAMS,
  type ReportFilters,
  type ReportStatusFilter,
} from "../list-params";

type ReportsToolbarProps = {
  filters: ReportFilters;
  /** The status shown when the URL names none: it differs between roles. */
  defaultStatus: ReportStatusFilter;
  options: ReportFilterOptions;
};

type PickerFilter = "projectId" | "organization" | "workerId";

const PICKER_PARAMS: Record<PickerFilter, string> = {
  projectId: REPORTS_SEARCH_PARAMS.project,
  organization: REPORTS_SEARCH_PARAMS.organization,
  workerId: REPORTS_SEARCH_PARAMS.worker,
};

export function ReportsToolbar({ filters, defaultStatus, options }: ReportsToolbarProps) {
  const t = useTranslations("reports.list");
  const ids = {
    project: useId(),
    organization: useId(),
    worker: useId(),
    from: useId(),
    to: useId(),
  };
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the controls show the new choice.
  const [status, setStatus] = useOptimistic(filters.status);
  const [picked, setPicked] = useOptimistic({
    projectId: filters.projectId,
    organization: filters.organization,
    workerId: filters.workerId,
  });
  const search = useDebouncedFilter(filters.query, REPORTS_SEARCH_PARAMS.query, navigate);
  // A date input reports every digit of the year as it is typed, so dates wait for a pause too.
  const fromDay = useDebouncedFilter(filters.from, REPORTS_SEARCH_PARAMS.from, navigate);
  const toDay = useDebouncedFilter(filters.to, REPORTS_SEARCH_PARAMS.to, navigate);

  function changeStatus(value: string) {
    const next = REPORT_STATUS_FILTERS.find((item) => item === value) ?? defaultStatus;
    startTransition(() => {
      setStatus(next);
      navigate({ [REPORTS_SEARCH_PARAMS.status]: next === defaultStatus ? null : next });
    });
  }

  function changePicker(filter: PickerFilter, value: string) {
    const next = value || null;
    startTransition(() => {
      setPicked((current) => ({ ...current, [filter]: next }));
      navigate({ [PICKER_PARAMS[filter]]: next });
    });
  }

  function resetFilters() {
    search.clear();
    fromDay.clear();
    toDay.clear();
    startTransition(() => {
      setStatus(defaultStatus);
      setPicked({ projectId: null, organization: null, workerId: null });
      navigate(Object.fromEntries(Object.values(REPORTS_SEARCH_PARAMS).map((key) => [key, null])));
    });
  }

  const hasFilters =
    search.input.trim() !== "" ||
    fromDay.input !== "" ||
    toDay.input !== "" ||
    status !== defaultStatus ||
    Object.values(picked).some((value) => value !== null);

  const picker = (
    filter: PickerFilter,
    id: string,
    items: RecordOption[],
    labels: { label: string; all: string; search: string; nothingFound: string },
  ) => (
    <div className="w-full min-w-0 sm:w-56">
      <label htmlFor={id} className="sr-only">
        {labels.label}
      </label>
      <RecordPicker
        id={id}
        options={items}
        value={picked[filter] ?? ""}
        onChange={(value) => changePicker(filter, value)}
        noneLabel={labels.all}
        searchLabel={labels.search}
        nothingFound={labels.nothingFound}
      />
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search.input}
          onChange={(event) => search.setInput(event.target.value)}
          placeholder={t(options.workers ? "searchPlaceholder" : "searchPlaceholderOwn")}
          aria-label={t("searchLabel")}
          className="pl-8"
        />
      </div>

      <Select value={status} onValueChange={changeStatus}>
        <SelectTrigger className="w-full sm:w-48" aria-label={t("statusFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORT_STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`statusFilters.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {picker("projectId", ids.project, options.projects, {
        label: t("projectFilter"),
        all: t("projectFilterAll"),
        search: t("projectSearch"),
        nothingFound: t("projectNothingFound"),
      })}
      {options.organizations &&
        picker("organization", ids.organization, options.organizations, {
          label: t("organizationFilter"),
          all: t("organizationFilterAll"),
          search: t("organizationSearch"),
          nothingFound: t("organizationNothingFound"),
        })}
      {options.workers &&
        picker("workerId", ids.worker, options.workers, {
          label: t("workerFilter"),
          all: t("workerFilterAll"),
          search: t("workerSearch"),
          nothingFound: t("workerNothingFound"),
        })}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={ids.from} className="font-normal whitespace-nowrap">
            {t("from")}
          </Label>
          <Input
            id={ids.from}
            type="date"
            value={fromDay.input}
            max={toDay.input || undefined}
            onChange={(event) => fromDay.setInput(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={ids.to} className="font-normal whitespace-nowrap">
            {t("to")}
          </Label>
          <Input
            id={ids.to}
            type="date"
            value={toDay.input}
            min={fromDay.input || undefined}
            onChange={(event) => toDay.setInput(event.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {hasFilters && (
        <Button variant="ghost" onClick={resetFilters}>
          <XIcon aria-hidden />
          {t("resetFilters")}
        </Button>
      )}
    </div>
  );
}
