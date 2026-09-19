"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useOptimistic, useTransition } from "react";

import { ACTIVE_FILTER_CLASS, ResetFiltersButton } from "@/components/data-table/filter-styles";
import {
  useDebouncedFilter,
  useFilterNavigation,
} from "@/components/data-table/use-filter-navigation";
import { RecordPicker, type RecordOption } from "@/components/reference-book/record-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ReportFilterOptions } from "../queries";
import {
  REPORT_MILEAGE_FILTERS,
  REPORT_STATUS_FILTERS,
  REPORTS_SEARCH_PARAMS,
  type ReportFilters,
  type ReportStatusFilter,
} from "../list-params";
import { MAX_MILEAGE_KM } from "../schemas";

type ReportsToolbarProps = {
  filters: ReportFilters;
  /** The status shown when the URL names none: it differs between roles. */
  defaultStatus: ReportStatusFilter;
  options: ReportFilterOptions;
};

// On a project card the search is not by project, which is the same for every row.
const SEARCH_PLACEHOLDERS = {
  registry: { all: "searchPlaceholder", own: "searchPlaceholderOwn" },
  project: { all: "searchPlaceholderProject", own: "searchPlaceholderProjectOwn" },
} as const;

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
    mileageFrom: useId(),
    mileageTo: useId(),
  };
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the controls show the new choice.
  const [status, setStatus] = useOptimistic(filters.status);
  const [mileage, setMileage] = useOptimistic(filters.mileage);
  const [picked, setPicked] = useOptimistic({
    projectId: filters.projectId,
    organization: filters.organization,
    workerId: filters.workerId,
  });
  const search = useDebouncedFilter(filters.query, REPORTS_SEARCH_PARAMS.query, navigate);
  // A date input reports every digit of the year as it is typed, so dates wait for a pause too.
  const fromDay = useDebouncedFilter(filters.from, REPORTS_SEARCH_PARAMS.from, navigate);
  const toDay = useDebouncedFilter(filters.to, REPORTS_SEARCH_PARAMS.to, navigate);
  const kmFrom = useDebouncedFilter(
    filters.mileageFrom?.toString() ?? "",
    REPORTS_SEARCH_PARAMS.mileageFrom,
    navigate,
  );
  const kmTo = useDebouncedFilter(
    filters.mileageTo?.toString() ?? "",
    REPORTS_SEARCH_PARAMS.mileageTo,
    navigate,
  );

  function changeStatus(value: string) {
    const next = REPORT_STATUS_FILTERS.find((item) => item === value) ?? defaultStatus;
    startTransition(() => {
      setStatus(next);
      navigate({ [REPORTS_SEARCH_PARAMS.status]: next === defaultStatus ? null : next });
    });
  }

  function changeMileage(value: string) {
    const next = REPORT_MILEAGE_FILTERS.find((item) => item === value) ?? "all";
    // The typed range belongs to the "range" choice only.
    kmFrom.clear();
    kmTo.clear();
    startTransition(() => {
      setMileage(next);
      navigate({
        [REPORTS_SEARCH_PARAMS.mileage]: next === "all" ? null : next,
        [REPORTS_SEARCH_PARAMS.mileageFrom]: null,
        [REPORTS_SEARCH_PARAMS.mileageTo]: null,
      });
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
    kmFrom.clear();
    kmTo.clear();
    startTransition(() => {
      setStatus(defaultStatus);
      setMileage("all");
      setPicked({ projectId: null, organization: null, workerId: null });
      navigate(Object.fromEntries(Object.values(REPORTS_SEARCH_PARAMS).map((key) => [key, null])));
    });
  }

  const active = {
    search: search.input.trim() !== "",
    status: status !== defaultStatus,
    from: fromDay.input !== "",
    to: toDay.input !== "",
    mileage: mileage !== "all",
  };
  const activeCount =
    Object.values(active).filter(Boolean).length +
    Object.values(picked).filter((value) => value !== null).length;
  const mark = (on: boolean) => (on ? ACTIVE_FILTER_CLASS : undefined);

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
        className={mark(picked[filter] !== null)}
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
          placeholder={t(
            SEARCH_PLACEHOLDERS[options.projects ? "registry" : "project"][
              options.workers ? "all" : "own"
            ],
          )}
          aria-label={t("searchLabel")}
          className={cn("pl-8", mark(active.search))}
        />
      </div>

      <Select value={status} onValueChange={changeStatus}>
        <SelectTrigger
          className={cn("w-full sm:w-48", mark(active.status))}
          aria-label={t("statusFilter")}
        >
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

      {options.projects &&
        picker("projectId", ids.project, options.projects, {
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
            className={cn("w-40", mark(active.from))}
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
            className={cn("w-40", mark(active.to))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={mileage} onValueChange={changeMileage}>
          <SelectTrigger
            className={cn("w-full sm:w-48", mark(active.mileage))}
            aria-label={t("mileageFilter")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_MILEAGE_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`mileageFilters.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mileage === "range" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor={ids.mileageFrom} className="font-normal whitespace-nowrap">
                {t("mileageFrom")}
              </Label>
              <Input
                id={ids.mileageFrom}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MILEAGE_KM}
                value={kmFrom.input}
                onChange={(event) => kmFrom.setInput(event.target.value)}
                className={cn("w-24", mark(kmFrom.input !== ""))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={ids.mileageTo} className="font-normal whitespace-nowrap">
                {t("mileageTo")}
              </Label>
              <Input
                id={ids.mileageTo}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MILEAGE_KM}
                value={kmTo.input}
                onChange={(event) => kmTo.setInput(event.target.value)}
                className={cn("w-24", mark(kmTo.input !== ""))}
              />
            </div>
          </div>
        )}
      </div>

      {activeCount > 0 && (
        <ResetFiltersButton label={t("resetFilters")} count={activeCount} onClick={resetFilters} />
      )}
    </div>
  );
}
