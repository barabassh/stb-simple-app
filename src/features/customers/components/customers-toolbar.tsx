"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import {
  useDebouncedFilter,
  useFilterNavigation,
} from "@/components/data-table/use-filter-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomerType } from "@/generated/prisma/enums";

import {
  CUSTOMER_STATUS_FILTERS,
  CUSTOMER_TYPES,
  CUSTOMERS_SEARCH_PARAMS,
  DEFAULT_CUSTOMER_STATUS,
  type CustomerStatusFilter,
} from "../list-params";

type CustomersToolbarProps = {
  query: string;
  type: CustomerType | null;
  status: CustomerStatusFilter;
};

/** Radix Select has no empty item value, so "all kinds" is a stand-in for no filter. */
const ALL_TYPES = "all";

export function CustomersToolbar({ query, type, status }: CustomersToolbarProps) {
  const t = useTranslations("customers");
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the control shows the new choice.
  const [optimisticType, setOptimisticType] = useOptimistic(type);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const search = useDebouncedFilter(query, CUSTOMERS_SEARCH_PARAMS.query, navigate);

  function changeType(value: string) {
    const next = CUSTOMER_TYPES.find((item) => item === value) ?? null;
    startTransition(() => {
      setOptimisticType(next);
      navigate({ [CUSTOMERS_SEARCH_PARAMS.type]: next });
    });
  }

  function changeStatus(value: string) {
    const next = CUSTOMER_STATUS_FILTERS.find((item) => item === value) ?? DEFAULT_CUSTOMER_STATUS;
    startTransition(() => {
      setOptimisticStatus(next);
      navigate({
        [CUSTOMERS_SEARCH_PARAMS.status]: next === DEFAULT_CUSTOMER_STATUS ? null : next,
      });
    });
  }

  function resetFilters() {
    search.clear();
    startTransition(() => {
      setOptimisticType(null);
      setOptimisticStatus(DEFAULT_CUSTOMER_STATUS);
      navigate({
        [CUSTOMERS_SEARCH_PARAMS.query]: null,
        [CUSTOMERS_SEARCH_PARAMS.type]: null,
        [CUSTOMERS_SEARCH_PARAMS.status]: null,
      });
    });
  }

  const hasFilters =
    search.input.trim() !== "" ||
    optimisticType !== null ||
    optimisticStatus !== DEFAULT_CUSTOMER_STATUS;

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
          placeholder={t("list.searchPlaceholder")}
          aria-label={t("list.searchLabel")}
          className="pl-8"
        />
      </div>

      <Select value={optimisticType ?? ALL_TYPES} onValueChange={changeType}>
        <SelectTrigger className="w-44" aria-label={t("list.typeFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES}>{t("list.typeFilters.all")}</SelectItem>
          {CUSTOMER_TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`types.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={optimisticStatus} onValueChange={changeStatus}>
        <SelectTrigger className="w-44" aria-label={t("list.statusFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOMER_STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`list.statusFilters.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" onClick={resetFilters}>
          <XIcon aria-hidden />
          {t("list.resetFilters")}
        </Button>
      )}
    </div>
  );
}
