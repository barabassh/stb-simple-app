"use client";

import { Columns3Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ColumnSettingsProps<TColumn extends string> = {
  /** The columns that may be hidden, in the table's order. */
  columns: { id: TColumn; label: string }[];
  hidden: readonly TColumn[];
  onChange: (hidden: TColumn[]) => void;
};

/** The "Столбцы" menu: which of the table's columns to show. The menu stays open between ticks. */
export function ColumnSettings<TColumn extends string>({
  columns,
  hidden,
  onChange,
}: ColumnSettingsProps<TColumn>) {
  const t = useTranslations("dataTable");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Columns3Icon aria-hidden />
          {t("columnSettings")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <DropdownMenuLabel>{t("visibleColumns")}</DropdownMenuLabel>
        {columns.map(({ id, label }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={!hidden.includes(id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? hidden.filter((column) => column !== id) : [...hidden, id])
            }
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={hidden.length === 0}
          onSelect={(event) => {
            event.preventDefault();
            onChange([]);
          }}
        >
          {t("showAllColumns")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
