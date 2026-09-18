import { detailText, type DetailGroup, type DetailRow } from "@/components/details/detail-rows";
import { formatCalendarDate, formatDecimal, formatMoney } from "@/lib/format";
import { formatAddress } from "@/lib/nl/address";

import type { ProjectDetails } from "./queries";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The saved project as its card shows it (docs/ТЗ.md, 6.9), in the "name — value" rows of the
 * company profile. Only the fields the query read for the reader are there, so a contractor gets
 * the number, name, site address, start date and duration without anything being hidden here.
 */
export function projectDetailGroup(
  project: ProjectDetails,
  t: Translate,
  locale: string,
  { customerLink }: { customerLink: boolean },
): DetailGroup {
  const label = (key: string) => t(`projects.fields.${key}`);
  const { customer, budget } = project;

  const customerRows: DetailRow[] = [];
  if (customer) {
    const text = customer.isActive
      ? customer.name
      : t("referenceBooks.archivedMark", { name: customer.name });
    customerRows.push({
      key: "customer",
      label: label("customer"),
      value: customerLink
        ? { type: "link", text, href: `/customers/${customer.id}`, external: false }
        : detailText(text),
    });
  }

  const budgetRows: DetailRow[] = budget
    ? [
        {
          key: "budgetAmount",
          label: label("budgetAmount"),
          value: detailText(formatMoney(budget.amount)),
        },
        {
          key: "vatRate",
          label: label("vatRate"),
          value: detailText(budget.vatRate && t(`projects.vatRates.${budget.vatRate}`)),
        },
        {
          key: "budgetWithVat",
          label: label("budgetWithVat"),
          value: detailText(formatMoney(budget.amountWithVat)),
        },
        {
          key: "budgetHours",
          label: label("budgetHours"),
          value: detailText(formatDecimal(budget.hours)),
        },
      ]
    : [];

  return {
    key: "project",
    rows: [
      { key: "number", label: label("number"), value: detailText(project.number) },
      { key: "name", label: label("name"), value: detailText(project.name) },
      ...customerRows,
      {
        key: "address",
        label: label("address"),
        value: detailText(formatAddress(project.address, locale)),
      },
      {
        key: "startDate",
        label: label("startDate"),
        value: detailText(formatCalendarDate(project.startDate)),
      },
      {
        key: "duration",
        label: label("duration"),
        value: detailText(
          project.duration === null
            ? t("projects.notStarted")
            : t("projects.card.duration", { count: project.duration }),
        ),
      },
      ...("description" in project
        ? [
            {
              key: "description",
              label: label("description"),
              value: detailText(project.description),
            },
          ]
        : []),
      ...budgetRows,
    ],
  };
}
