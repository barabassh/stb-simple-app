"use client";

import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { TABLE_SEARCH_PARAMS } from "@/components/data-table/search-params";
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

import {
  DEFAULT_USER_STATUS,
  USER_ROLES,
  USER_STATUS_FILTERS,
  USERS_SEARCH_PARAMS,
  type UserStatusFilter,
} from "../list-params";

const SEARCH_DEBOUNCE_MS = 300;

type UsersToolbarProps = {
  query: string;
  roles: Role[];
  status: UserStatusFilter;
};

export function UsersToolbar({ query, roles, status }: UsersToolbarProps) {
  const t = useTranslations("users");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL only changes once the navigation finishes; until then the menu shows the new choice.
  const [optimisticRoles, setOptimisticRoles] = useOptimistic(roles);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [search, setSearch] = useState(query);
  // Tells the search this component wrote to the URL apart from outside changes (back button, reset link).
  const pushedQuery = useRef(query);

  const navigate = useCallback(
    (changes: Record<string, string | null>, history: "push" | "replace" = "push") => {
      // Read at call time rather than from props: the debounced search fires later
      // and must not undo a filter changed in the meantime.
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete(TABLE_SEARCH_PARAMS.page);

      const search = params.toString();
      router[history](search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  useEffect(() => {
    if (query !== pushedQuery.current) {
      pushedQuery.current = query;
      setSearch(query);
    }
  }, [query]);

  useEffect(() => {
    const value = search.trim();
    if (value === pushedQuery.current) return;

    const timer = setTimeout(() => {
      pushedQuery.current = value;
      navigate({ [USERS_SEARCH_PARAMS.query]: value }, "replace");
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, navigate]);

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
    pushedQuery.current = "";
    setSearch("");
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

  const hasFilters =
    search.trim() !== "" || optimisticRoles.length > 0 || optimisticStatus !== DEFAULT_USER_STATUS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("list.searchPlaceholder")}
          aria-label={t("list.searchLabel")}
          className="pl-8"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
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
        <SelectTrigger className="w-44" aria-label={t("list.statusFilter")}>
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

      {hasFilters && (
        <Button variant="ghost" onClick={resetFilters}>
          <XIcon aria-hidden />
          {t("list.resetFilters")}
        </Button>
      )}
    </div>
  );
}
