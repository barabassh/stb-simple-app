"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RecordOption = { id: string; name: string; isActive: boolean };

type RecordPickerProps = {
  id: string;
  /** The active records, plus the chosen one when it has since been archived. */
  options: RecordOption[];
  /** The chosen id, "" for none. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** Offered first when the field may be left empty. */
  noneLabel?: string;
  /** Shown while nothing is chosen in a field that may not be left empty. */
  placeholder?: string;
  searchLabel: string;
  nothingFound: string;
  ref?: React.Ref<HTMLButtonElement>;
};

/**
 * A choice from a reference book with a search line (docs/АРХИТЕКТУРА.md, 3.8). An archived record
 * is shown with a mark; the list comes from the server, which checks the choice again.
 */
export function RecordPicker({
  id,
  options,
  value,
  onChange,
  onBlur,
  invalid,
  noneLabel,
  placeholder,
  searchLabel,
  nothingFound,
  ref,
}: RecordPickerProps) {
  const t = useTranslations("referenceBooks");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.id === value);
  const items = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (search) {
      return options.filter((option) => option.name.toLocaleLowerCase().includes(search));
    }
    return noneLabel ? [{ id: "", name: noneLabel, isActive: true }, ...options] : options;
  }, [options, query, noneLabel]);

  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, active]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(
        Math.max(
          0,
          items.findIndex((item) => item.id === value),
        ),
      );
    } else {
      onBlur?.();
    }
  }

  function choose(item: RecordOption) {
    onChange(item.id);
    changeOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.min(Math.max(current + step, 0), items.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  }

  const label = (option: RecordOption) =>
    option.isActive ? option.name : t("archivedMark", { name: option.name });

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
            {selected ? label(selected) : (noneLabel ?? placeholder ?? "")}
          </span>
          <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-1">
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={searchLabel}
          aria-label={searchLabel}
          aria-controls={listId}
          aria-activedescendant={items[active] ? optionId(active) : undefined}
          autoComplete="off"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={searchLabel}
          className="max-h-64 overflow-y-auto"
        >
          {items.length === 0 && (
            <li className="px-2 py-1.5 text-muted-foreground">{nothingFound}</li>
          )}
          {items.map((item, index) => (
            <li
              key={item.id || "none"}
              id={optionId(index)}
              role="option"
              aria-selected={item.id === value}
              onClick={() => choose(item)}
              onMouseMove={() => setActive(index)}
              className={cn(
                "flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5",
                index === active && "bg-accent text-accent-foreground",
                item.id === "" && "text-muted-foreground",
              )}
            >
              <span className="min-w-0 break-words">{label(item)}</span>
              {item.id === value && <CheckIcon aria-hidden className="size-4 shrink-0" />}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
