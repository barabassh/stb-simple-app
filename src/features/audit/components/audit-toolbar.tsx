"use client";

import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useOptimistic, useTransition } from "react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditAction } from "@/generated/prisma/enums";
import { AUDIT_ENTITIES } from "@/lib/audit";
import { cn } from "@/lib/utils";

import { AUDIT_ACTIONS, AUDIT_SEARCH_PARAMS, type AuditListParams } from "../list-params";

const ALL_ENTITIES = "all";

type AuditToolbarProps = Omit<AuditListParams, "table">;

export function AuditToolbar({ actor, actions, entity, from, to }: AuditToolbarProps) {
  const t = useTranslations("audit");
  const navigate = useFilterNavigation();
  const [, startTransition] = useTransition();
  const fromId = useId();
  const toId = useId();
  // The URL only changes once the navigation finishes; until then the controls show the new choice.
  const [optimisticActions, setOptimisticActions] = useOptimistic(actions);
  const [optimisticEntity, setOptimisticEntity] = useOptimistic(entity);
  const author = useDebouncedFilter(actor, AUDIT_SEARCH_PARAMS.actor, navigate);
  // A date input reports every digit of the year as it is typed, so dates wait for a pause too.
  const fromDay = useDebouncedFilter(from, AUDIT_SEARCH_PARAMS.from, navigate);
  const toDay = useDebouncedFilter(to, AUDIT_SEARCH_PARAMS.to, navigate);

  function changeAction(action: AuditAction, checked: boolean) {
    const next = AUDIT_ACTIONS.filter((item) =>
      item === action ? checked : optimisticActions.includes(item),
    );
    startTransition(() => {
      setOptimisticActions(next);
      navigate({ [AUDIT_SEARCH_PARAMS.actions]: next.join(",") });
    });
  }

  function changeEntity(value: string) {
    const next = AUDIT_ENTITIES.find((item) => item === value) ?? null;
    startTransition(() => {
      setOptimisticEntity(next);
      navigate({ [AUDIT_SEARCH_PARAMS.entity]: next });
    });
  }

  function resetFilters() {
    author.clear();
    fromDay.clear();
    toDay.clear();
    startTransition(() => {
      setOptimisticActions([]);
      setOptimisticEntity(null);
      navigate(Object.fromEntries(Object.values(AUDIT_SEARCH_PARAMS).map((key) => [key, null])));
    });
  }

  const active = {
    search: author.input.trim() !== "",
    actions: optimisticActions.length > 0,
    entity: optimisticEntity !== null,
    from: fromDay.input !== "",
    to: toDay.input !== "",
  };
  const activeCount = Object.values(active).filter(Boolean).length;
  const mark = (on: boolean) => (on ? ACTIVE_FILTER_CLASS : undefined);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={author.input}
          onChange={(event) => author.setInput(event.target.value)}
          placeholder={t("filters.actorPlaceholder")}
          aria-label={t("filters.actor")}
          className={cn("pl-8", mark(active.search))}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={mark(active.actions)}>
            {t("filters.action")}
            {optimisticActions.length > 0 && (
              <Badge variant="secondary">{optimisticActions.length}</Badge>
            )}
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          {AUDIT_ACTIONS.map((action) => (
            <DropdownMenuCheckboxItem
              key={action}
              checked={optimisticActions.includes(action)}
              onCheckedChange={(checked) => changeAction(action, checked === true)}
              // Keeps the menu open so that several actions can be picked in a row.
              onSelect={(event) => event.preventDefault()}
            >
              {t(`actions.${action}`)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select value={optimisticEntity ?? ALL_ENTITIES} onValueChange={changeEntity}>
        <SelectTrigger className={cn("w-44", mark(active.entity))} aria-label={t("filters.entity")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ENTITIES}>{t("filters.allEntities")}</SelectItem>
          {AUDIT_ENTITIES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`entities.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={fromId} className="font-normal whitespace-nowrap">
            {t("filters.from")}
          </Label>
          <Input
            id={fromId}
            type="date"
            value={fromDay.input}
            max={toDay.input || undefined}
            onChange={(event) => fromDay.setInput(event.target.value)}
            className={cn("w-40", mark(active.from))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={toId} className="font-normal whitespace-nowrap">
            {t("filters.to")}
          </Label>
          <Input
            id={toId}
            type="date"
            value={toDay.input}
            min={fromDay.input || undefined}
            onChange={(event) => toDay.setInput(event.target.value)}
            className={cn("w-40", mark(active.to))}
          />
        </div>
      </div>

      {activeCount > 0 && (
        <ResetFiltersButton label={t("filters.reset")} count={activeCount} onClick={resetFilters} />
      )}
    </div>
  );
}
