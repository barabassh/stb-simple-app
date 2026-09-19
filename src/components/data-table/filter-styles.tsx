import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Marks a filter control set to something other than its default, so a narrowed list is noticed
 * at a glance (docs/ТЗ.md, 7.9). Added to the control's own classes.
 */
export const ACTIVE_FILTER_CLASS =
  "border-filter-active bg-filter-active/10 hover:bg-filter-active/15 dark:bg-filter-active/20";

type ResetFiltersButtonProps = {
  label: string;
  /** How many filters are set, shown on the button. */
  count: number;
  onClick: () => void;
};

/** "Сбросить фильтры", coloured to stand out next to the filters it clears. */
export function ResetFiltersButton({ label, count, onClick }: ResetFiltersButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive dark:border-destructive/50 dark:bg-destructive/20"
    >
      <XIcon aria-hidden />
      {label}
      <span className="rounded-full bg-destructive px-1.5 text-xs leading-5 font-medium text-white tabular-nums">
        {count}
      </span>
    </Button>
  );
}
