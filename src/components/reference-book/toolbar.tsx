"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { ACTIVE_FILTER_CLASS, ResetFiltersButton } from "@/components/data-table/filter-styles";
import {
  useDebouncedFilter,
  useFilterNavigation,
} from "@/components/data-table/use-filter-navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  DEFAULT_REFERENCE_STATUS,
  REFERENCE_SEARCH_PARAMS,
  REFERENCE_STATUS_FILTERS,
  type ReferenceSection,
  type ReferenceStatusFilter,
} from "./list-params";

/** A filter of one section, such as the kind of customer; null in `value` means "all". */
export type ReferenceSelectFilter = {
  param: string;
  value: string | null;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
};

type ReferenceToolbarProps = {
  section: ReferenceSection;
  query: string;
  status: ReferenceStatusFilter;
  filters?: ReferenceSelectFilter[];
};

/** Radix Select has no empty item value, so "all" is a stand-in for no filter. */
const ALL = "all";

export function ReferenceToolbar({ section, query, status, filters = [] }: ReferenceToolbarProps) {
  const t = useTranslations();
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the controls show the new choice.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [optimisticFilters, setOptimisticFilters] = useOptimistic(
    Object.fromEntries(filters.map((filter) => [filter.param, filter.value])),
  );
  const search = useDebouncedFilter(query, REFERENCE_SEARCH_PARAMS.query, navigate);

  function changeFilter(filter: ReferenceSelectFilter, value: string) {
    const next = filter.options.find((option) => option.value === value)?.value ?? null;
    startTransition(() => {
      setOptimisticFilters((current) => ({ ...current, [filter.param]: next }));
      navigate({ [filter.param]: next });
    });
  }

  function changeStatus(value: string) {
    const next =
      REFERENCE_STATUS_FILTERS.find((item) => item === value) ?? DEFAULT_REFERENCE_STATUS;
    startTransition(() => {
      setOptimisticStatus(next);
      navigate({
        [REFERENCE_SEARCH_PARAMS.status]: next === DEFAULT_REFERENCE_STATUS ? null : next,
      });
    });
  }

  function resetFilters() {
    search.clear();
    const cleared = Object.fromEntries(filters.map((filter) => [filter.param, null]));
    startTransition(() => {
      setOptimisticFilters(cleared);
      setOptimisticStatus(DEFAULT_REFERENCE_STATUS);
      navigate({
        ...cleared,
        [REFERENCE_SEARCH_PARAMS.query]: null,
        [REFERENCE_SEARCH_PARAMS.status]: null,
      });
    });
  }

  const active = {
    search: search.input.trim() !== "",
    status: optimisticStatus !== DEFAULT_REFERENCE_STATUS,
  };
  const activeCount =
    Object.values(active).filter(Boolean).length +
    Object.values(optimisticFilters).filter((value) => value !== null).length;
  const mark = (on: boolean) => (on ? ACTIVE_FILTER_CLASS : undefined);

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
          placeholder={t(`${section}.list.searchPlaceholder`)}
          aria-label={t(`${section}.list.searchLabel`)}
          className={cn("pl-8", mark(active.search))}
        />
      </div>

      {filters.map((filter) => (
        <Select
          key={filter.param}
          value={optimisticFilters[filter.param] ?? ALL}
          onValueChange={(value) => changeFilter(filter, value)}
        >
          <SelectTrigger
            className={cn("w-44", mark(optimisticFilters[filter.param] != null))}
            aria-label={filter.label}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{filter.allLabel}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      <Select value={optimisticStatus} onValueChange={changeStatus}>
        <SelectTrigger
          className={cn("w-44", mark(active.status))}
          aria-label={t("referenceBooks.list.statusFilter")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REFERENCE_STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`referenceBooks.list.statusFilters.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeCount > 0 && (
        <ResetFiltersButton
          label={t("referenceBooks.list.resetFilters")}
          count={activeCount}
          onClick={resetFilters}
        />
      )}
    </div>
  );
}
