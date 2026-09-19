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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  DEFAULT_PROJECT_STATUS,
  PROJECT_STATUS_FILTERS,
  PROJECTS_SEARCH_PARAMS,
  type ProjectStatusFilter,
} from "../list-params";

type ProjectsToolbarProps = {
  query: string;
  status: ProjectStatusFilter;
  customerId: string | null;
  /** The customers to filter by; null for a reader who has only the search (a contractor). */
  customers: RecordOption[] | null;
};

export function ProjectsToolbar({ query, status, customerId, customers }: ProjectsToolbarProps) {
  const t = useTranslations("projects.list");
  const customerPickerId = useId();
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the controls show the new choice.
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [optimisticCustomer, setOptimisticCustomer] = useOptimistic(customerId);
  const search = useDebouncedFilter(query, PROJECTS_SEARCH_PARAMS.query, navigate);

  function changeStatus(value: string) {
    const next = PROJECT_STATUS_FILTERS.find((item) => item === value) ?? DEFAULT_PROJECT_STATUS;
    startTransition(() => {
      setOptimisticStatus(next);
      navigate({ [PROJECTS_SEARCH_PARAMS.status]: next === DEFAULT_PROJECT_STATUS ? null : next });
    });
  }

  function changeCustomer(value: string) {
    const next = value || null;
    startTransition(() => {
      setOptimisticCustomer(next);
      navigate({ [PROJECTS_SEARCH_PARAMS.customer]: next });
    });
  }

  function resetFilters() {
    search.clear();
    startTransition(() => {
      setOptimisticStatus(DEFAULT_PROJECT_STATUS);
      setOptimisticCustomer(null);
      navigate({
        [PROJECTS_SEARCH_PARAMS.query]: null,
        [PROJECTS_SEARCH_PARAMS.status]: null,
        [PROJECTS_SEARCH_PARAMS.customer]: null,
      });
    });
  }

  const active = {
    search: search.input.trim() !== "",
    status: optimisticStatus !== DEFAULT_PROJECT_STATUS,
    customer: optimisticCustomer !== null,
  };
  const activeCount = Object.values(active).filter(Boolean).length;
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
          placeholder={t(customers ? "searchPlaceholder" : "searchPlaceholderActive")}
          aria-label={t("searchLabel")}
          className={cn("pl-8", mark(active.search))}
        />
      </div>

      {customers && (
        <>
          <Select value={optimisticStatus} onValueChange={changeStatus}>
            <SelectTrigger
              className={cn("w-44", mark(active.status))}
              aria-label={t("statusFilter")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`statusFilters.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-full min-w-0 sm:w-56">
            <label htmlFor={customerPickerId} className="sr-only">
              {t("customerFilter")}
            </label>
            <RecordPicker
              id={customerPickerId}
              options={customers}
              value={optimisticCustomer ?? ""}
              onChange={changeCustomer}
              noneLabel={t("customerFilterAll")}
              searchLabel={t("customerSearch")}
              nothingFound={t("customerNothingFound")}
              className={mark(active.customer)}
            />
          </div>
        </>
      )}

      {activeCount > 0 && (
        <ResetFiltersButton label={t("resetFilters")} count={activeCount} onClick={resetFilters} />
      )}
    </div>
  );
}
