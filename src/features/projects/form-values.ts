import type { VatRate } from "@/generated/prisma/enums";
import { formatDecimal } from "@/lib/format";
import { addressInput, emptyAddressInput } from "@/lib/nl/schemas";

import type { ProjectFormInput, ProjectFormValues } from "./schemas";

/** The stored fields the form edits, in the shape the record has in the database. */
export type ProjectFormRecord = {
  number: string;
  name: string;
  customerId: string;
  street: string;
  houseNumber: number;
  houseNumberAddition: string | null;
  postcode: string;
  city: string;
  country: string;
  startDate: Date;
  description: string | null;
  /** Exact decimal strings, as `Decimal.toFixed(2)` gives them. */
  budgetAmount: string | null;
  vatRate: VatRate | null;
  budgetHours: string | null;
};

/** 21 % is offered from the start (docs/ТЗ.md, 6.6); it is stored only with an amount. */
const DEFAULT_VAT_RATE: VatRate = "STANDARD_21";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The values the form opens with: a new project gets the suggested number and nothing else. */
export function projectFormValues(
  project: ProjectFormRecord | null,
  suggestedNumber = "",
): ProjectFormInput {
  if (!project) {
    return {
      number: suggestedNumber,
      name: "",
      customerId: "",
      address: emptyAddressInput,
      startDate: "",
      description: "",
      budgetAmount: "",
      vatRate: DEFAULT_VAT_RATE,
      budgetHours: "",
    };
  }

  return {
    number: project.number,
    name: project.name,
    customerId: project.customerId,
    address: addressInput(project),
    startDate: isoDate(project.startDate),
    description: project.description ?? "",
    // Shown the way the user types them; the schema reads the grouping back.
    budgetAmount: formatDecimal(project.budgetAmount, { minimumFractionDigits: 2 }),
    vatRate: project.vatRate ?? DEFAULT_VAT_RATE,
    budgetHours: formatDecimal(project.budgetHours),
  };
}

/**
 * The stored project as the schema outputs the form, so that the audit snapshots before and after
 * a save compare equal when nothing changed, however the amounts were typed.
 */
export function projectStoredValues(project: ProjectFormRecord): ProjectFormValues {
  return {
    number: project.number,
    name: project.name,
    customerId: project.customerId,
    address: {
      street: project.street,
      houseNumber: String(project.houseNumber),
      houseNumberAddition: project.houseNumberAddition ?? "",
      postcode: project.postcode,
      city: project.city,
      country: project.country as ProjectFormValues["address"]["country"],
    },
    startDate: isoDate(project.startDate),
    description: project.description ?? "",
    budgetAmount: project.budgetAmount ?? "",
    vatRate: project.budgetAmount === null ? undefined : (project.vatRate ?? undefined),
    budgetHours: project.budgetHours ?? "",
  };
}
