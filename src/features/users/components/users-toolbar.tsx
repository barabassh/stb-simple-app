"use client";

import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { ACTIVE_FILTER_CLASS, ResetFiltersButton } from "@/components/data-table/filter-styles";
import {
  useDebouncedFilter,
  useFilterNavigation,
} from "@/components/data-table/use-filter-navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import {
  DEFAULT_USER_STATUS,
  USER_ROLES,
  USER_STATUS_FILTERS,
  USERS_SEARCH_PARAMS,
  type UserStatusFilter,
} from "../list-params";

type UsersToolbarProps = {
  query: string;
  roles: Role[];
  status: UserStatusFilter;
};

export function UsersToolbar({ query, roles, status }: UsersToolbarProps) {
  const t = useTranslations("users");
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the menu shows the new choice.
  const [optimisticRoles, setOptimisticRoles] = useOptimistic(roles);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const search = useDebouncedFilter(query, USERS_SEARCH_PARAMS.query, navigate);

  function changeRole(role: Role, checked: boolean) {
    const next = USER_ROLES.filter((item) =>
      item === role ? checked : optimisticRoles.includes(item),
    );
    startTransition(() => {
      setOptimisticRoles(next);
      navigate({ [USERS_SEARCH_PARAMS.roles]: next.join(",") });
    });
  }

  function changeStatus(value: string) {
    const next = USER_STATUS_FILTERS.find((item) => item === value) ?? DEFAULT_USER_STATUS;
    startTransition(() => {
      setOptimisticStatus(next);
      navigate({ [USERS_SEARCH_PARAMS.status]: next === DEFAULT_USER_STATUS ? null : next });
    });
  }

  function resetFilters() {
    search.clear();
    startTransition(() => {
      setOptimisticRoles([]);
      setOptimisticStatus(DEFAULT_USER_STATUS);
      navigate({
        [USERS_SEARCH_PARAMS.query]: null,
        [USERS_SEARCH_PARAMS.roles]: null,
        [USERS_SEARCH_PARAMS.status]: null,
      });
    });
  }

  const active = {
    search: search.input.trim() !== "",
    roles: optimisticRoles.length > 0,
    status: optimisticStatus !== DEFAULT_USER_STATUS,
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
          placeholder={t("list.searchPlaceholder")}
          aria-label={t("list.searchLabel")}
          className={cn("pl-8", mark(active.search))}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={mark(active.roles)}>
            {t("list.roleFilter")}
            {optimisticRoles.length > 0 && (
              <Badge variant="secondary">{optimisticRoles.length}</Badge>
            )}
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          {USER_ROLES.map((role) => (
            <DropdownMenuCheckboxItem
              key={role}
              checked={optimisticRoles.includes(role)}
              onCheckedChange={(checked) => changeRole(role, checked === true)}
              // Keeps the menu open so that several roles can be picked in a row.
              onSelect={(event) => event.preventDefault()}
            >
              {t(`roles.${role}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select value={optimisticStatus} onValueChange={changeStatus}>
        <SelectTrigger
          className={cn("w-44", mark(active.status))}
          aria-label={t("list.statusFilter")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {USER_STATUS_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`list.statusFilters.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeCount > 0 && (
        <ResetFiltersButton
          label={t("list.resetFilters")}
          count={activeCount}
          onClick={resetFilters}
        />
      )}
    </div>
  );
}
