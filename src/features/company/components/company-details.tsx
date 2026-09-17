import { Badge } from "@/components/ui/badge";

import type { DetailGroup, DetailRow, DetailValue } from "../details";

const NOT_SET = "—";

function Value({ value }: { value: DetailValue }) {
  if (!value) return <span className="text-muted-foreground">{NOT_SET}</span>;
  if (value.type === "text") return value.text;
  return (
    <a
      href={value.href}
      className="text-primary underline-offset-4 hover:underline"
      {...(value.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {value.text}
    </a>
  );
}

/**
 * One "name — value" row of every group: side by side from 640 px, the name above the value on a
 * phone. Names wrap between words; long values such as email addresses and links have no
 * spaces to wrap at, so they break anywhere instead of widening the page.
 */
export function CompanyDetailRow({ label, value, badge }: Omit<DetailRow, "key">) {
  return (
    <div className="grid sm:col-span-2 sm:grid-cols-subgrid">
      <dt className="px-4 pt-2.5 font-semibold break-words sm:py-2.5">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pb-2.5 whitespace-pre-wrap [overflow-wrap:anywhere] sm:border-l sm:py-2.5">
        <Value value={value} />
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </dd>
    </div>
  );
}

/** A framed table of a group, in two columns from 1280 px (docs/ТЗ.md, 5.6). */
export function CompanyDetailGroup({ group }: { group: DetailGroup }) {
  const titleId = `company-details-${group.key}`;
  const half = Math.ceil(group.rows.length / 2);
  const columns = [group.rows.slice(0, half), group.rows.slice(half)].filter(
    (rows) => rows.length > 0,
  );

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
      <h3 id={titleId} className="font-medium text-muted-foreground">
        {group.title}
      </h3>
      <div
        className={
          columns.length > 1
            ? "grid divide-y overflow-hidden rounded-xl border xl:grid-cols-2 xl:divide-x xl:divide-y-0"
            : "overflow-hidden rounded-xl border"
        }
      >
        {columns.map((rows, index) => (
          <dl
            key={index}
            // One grid for the rows of a column keeps their cells aligned; the name column is never
            // narrower than its longest word. The last row takes the height left over next to a
            // longer column, so the line between names and values runs down to the frame.
            className="min-w-0 divide-y sm:grid sm:grid-cols-[minmax(min-content,2fr)_3fr]"
            style={{ gridTemplateRows: `${"auto ".repeat(rows.length - 1)}1fr` }}
          >
            {rows.map(({ key, ...row }) => (
              <CompanyDetailRow key={key} {...row} />
            ))}
          </dl>
        ))}
      </div>
    </section>
  );
}
