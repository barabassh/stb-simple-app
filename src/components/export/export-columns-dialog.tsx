"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GripVerticalIcon,
  PrinterIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { saveExportColumns } from "@/features/export/actions";
import type { ExportColumnChoice } from "@/features/export/queries";
import type { ExportFormat } from "@/lib/export";
import { withExportColumns } from "@/lib/export/links";
import { cn } from "@/lib/utils";

const ICONS = { xlsx: FileSpreadsheetIcon, pdf: FileTextIcon, print: PrinterIcon };

// Held near the edge of the list, a dragged column scrolls it, a step a frame, so that it can be
// taken past what the list shows.
const SCROLL_EDGE = 32;
const SCROLL_STEP = 8;

/** The column being dragged and where the pointer is; a ref, as moves come faster than renders. */
type DragState = { key: string; y: number; frame: number | null };

export type ExportLink = {
  format: ExportFormat;
  label: string;
  href: string;
  /** Refused with these parameters: shown disabled, described by the refusal. */
  refused: boolean;
};

type ExportColumnsDialogProps = {
  report: string;
  links: ExportLink[];
  choice: ExportColumnChoice;
  /** The id of the text explaining why some of the links are refused. */
  refusalId: string;
};

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key, index) => key === b[index]);

/** The keys with one of them moved to a new index. */
function move(order: readonly string[], key: string, index: number): string[] {
  const rest = order.filter((item) => item !== key);
  return [...rest.slice(0, index), key, ...rest.slice(index)];
}

/**
 * The export buttons (docs/ТЗ.md, 4.11). Each opens the choice of columns for the file: which of
 * them, ticked, and in what order, dragged by the handle or moved with the arrows (the arrows serve
 * the keyboard and a finger that misses the handle). The choice is remembered for the next export
 * of the same list. Plain navigation rather than next/link: a prefetched print view would log an
 * export nobody made.
 */
export function ExportColumnsDialog({
  report,
  links,
  choice,
  refusalId,
}: ExportColumnsDialogProps) {
  const t = useTranslations("export");
  const idPrefix = useId();
  const [open, setOpen] = useState<ExportLink | null>(null);
  const [hidden, setHidden] = useState<string[]>(choice.hidden);
  const [order, setOrder] = useState<string[]>(choice.columns.map((column) => column.key));
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const headers = new Map(choice.columns.map((column) => [column.key, column.header]));
  const chosen = order.filter((key) => !hidden.includes(key));

  const toggle = (key: string, checked: boolean) =>
    setHidden((current) =>
      checked ? current.filter((column) => column !== key) : [...current, key],
    );

  const confirm = () => {
    if (!open || chosen.length === 0) return;
    // The file takes every column in the report's order without the parameter.
    const href = withExportColumns(
      open.href,
      hidden.length > 0 || !sameOrder(order, choice.reportOrder) ? chosen : null,
    );
    startTransition(async () => {
      // Remembering the choice is a convenience: the file is made whether or not it is saved.
      await saveExportColumns({ report, hidden, order }).catch(() => undefined);
      setOpen(null);
      window.location.assign(href);
    });
  };

  // The dragged column goes before the first of the others whose middle is below the pointer.
  const place = () => {
    const state = dragRef.current;
    const list = listRef.current;
    if (!state || !list) return;
    const others = [...list.querySelectorAll<HTMLElement>("[data-column]")].filter(
      (row) => row.dataset.column !== state.key,
    );
    const index = others.filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2 < state.y;
    }).length;
    setOrder((current) => {
      const next = move(current, state.key, index);
      return sameOrder(next, current) ? current : next;
    });
  };

  const scroll = () => {
    const state = dragRef.current;
    const list = listRef.current;
    if (!state || !list) return;
    const { top, bottom } = list.getBoundingClientRect();
    const step =
      state.y < top + SCROLL_EDGE ? -SCROLL_STEP : state.y > bottom - SCROLL_EDGE ? SCROLL_STEP : 0;
    const before = list.scrollTop;
    list.scrollTop += step;
    if (list.scrollTop === before) {
      state.frame = null;
      return;
    }
    place();
    state.frame = requestAnimationFrame(scroll);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, key: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { key, y: event.clientY, frame: null };
    setDragging(key);
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state) return;
    state.y = event.clientY;
    place();
    if (state.frame === null) scroll();
  };

  const endDrag = () => {
    const state = dragRef.current;
    if (state?.frame != null) cancelAnimationFrame(state.frame);
    dragRef.current = null;
    setDragging(null);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const Icon = ICONS[link.format];
          return (
            <Button
              key={link.format}
              variant="outline"
              disabled={link.refused}
              aria-describedby={link.refused ? refusalId : undefined}
              onClick={() => setOpen(link)}
            >
              <Icon aria-hidden />
              {link.label}
            </Button>
          );
        })}
      </div>

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{open?.label}</DialogTitle>
            <DialogDescription>{t("columns.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={hidden.length === 0}
              onClick={() => setHidden([])}
            >
              {t("columns.selectAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chosen.length === 0}
              onClick={() => setHidden([...order])}
            >
              {t("columns.clearAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sameOrder(order, choice.reportOrder)}
              onClick={() => setOrder([...choice.reportOrder])}
            >
              {t("columns.resetOrder")}
            </Button>
          </div>

          <ul
            ref={listRef}
            aria-label={t("columns.legend")}
            className="-mx-1 flex max-h-[50svh] flex-col gap-0.5 overflow-y-auto px-1"
          >
            {order.map((key, index) => {
              const id = `${idPrefix}-${key}`;
              const header = headers.get(key) ?? key;
              return (
                <li
                  key={key}
                  data-column={key}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md border border-transparent py-0.5 pr-0.5",
                    dragging === key && "border-border bg-muted shadow-sm",
                  )}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    title={t("columns.dragHint")}
                    className={cn(
                      "flex size-7 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted",
                      dragging === key ? "cursor-grabbing" : "cursor-grab",
                    )}
                    onPointerDown={(event) => startDrag(event, key)}
                    onPointerMove={drag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    <GripVerticalIcon className="size-4" />
                  </button>
                  <Checkbox
                    id={id}
                    checked={!hidden.includes(key)}
                    onCheckedChange={(checked) => toggle(key, checked === true)}
                  />
                  <Label
                    htmlFor={id}
                    className="min-w-0 flex-1 py-1 pl-1 font-normal break-words select-none"
                  >
                    {header}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={t("columns.moveUp", { column: header })}
                    onClick={() => setOrder((current) => move(current, key, index - 1))}
                  >
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === order.length - 1}
                    aria-label={t("columns.moveDown", { column: header })}
                    onClick={() => setOrder((current) => move(current, key, index + 1))}
                  >
                    <ArrowDownIcon aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>

          {chosen.length === 0 && (
            <p className="text-sm text-destructive">{t("columns.noneChosen")}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(null)}>
              {t("columns.cancel")}
            </Button>
            <Button type="button" disabled={chosen.length === 0 || pending} onClick={confirm}>
              {open?.format === "print" ? t("columns.print") : t("columns.download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
