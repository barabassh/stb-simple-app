import { getLocale, getTranslations } from "next-intl/server";

import { DetailsGroup } from "@/components/details/details-group";

import { contractorDetailGroup } from "../details";
import type { ContractorDetails as ContractorRecord } from "../queries";

/** The "Сведения" tab: the same rows as the company profile block (docs/ТЗ.md, 6.5). */
export async function ContractorDetails({ contractor }: { contractor: ContractorRecord }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return <DetailsGroup group={contractorDetailGroup(contractor, t, locale)} />;
}
