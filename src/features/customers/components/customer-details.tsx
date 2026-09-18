import { getLocale, getTranslations } from "next-intl/server";

import { DetailsGroup } from "@/components/details/details-group";

import { customerDetailGroup } from "../details";
import type { CustomerDetails as CustomerRecord } from "../queries";

/** The "Сведения" tab: the same rows as the company profile block (docs/ТЗ.md, 6.4). */
export async function CustomerDetails({ customer }: { customer: CustomerRecord }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return <DetailsGroup group={customerDetailGroup(customer, t, locale)} />;
}
