import { getTranslations } from "next-intl/server";

import { referenceStatusName } from "@/components/reference-book/status-name";
import { defineExportReport } from "@/lib/export";

import { parseContractorsListParams } from "./list-params";
import { countContractorsForExport, listContractorsForExport } from "./queries";

type ContractorExportRow = {
  name: string;
  kvkNumber: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
};

/** The columns of the registry (docs/ТЗ.md, 6.5). */
export const contractorsExport = defineExportReport<ContractorExportRow>({
  name: "contractors",
  path: "/contractors",
  permission: "contractors.export",
  entity: "Contractor",
  count: (actor, searchParams) =>
    countContractorsForExport(actor, parseContractorsListParams(searchParams)),
  async columns() {
    const t = await getTranslations("contractors");
    return [
      { key: "name", header: t("columns.name") },
      { key: "kvkNumber", header: t("columns.kvkNumber") },
      { key: "contactPerson", header: t("columns.contactPerson") },
      { key: "phone", header: t("columns.phone") },
      { key: "email", header: t("columns.email") },
      { key: "city", header: t("columns.city") },
      { key: "status", header: t("columns.status") },
    ];
  },
  async load(actor, searchParams) {
    const [t, tAll, contractors] = await Promise.all([
      getTranslations("contractors"),
      getTranslations(),
      listContractorsForExport(actor, parseContractorsListParams(searchParams)),
    ]);

    return {
      title: t("export.title"),
      rows: contractors.map((contractor) => ({
        name: contractor.name,
        kvkNumber: contractor.kvkNumber,
        contactPerson: contractor.contactPerson,
        phone: contractor.phone,
        email: contractor.email,
        city: contractor.city,
        status: referenceStatusName(contractor.isActive, tAll),
      })),
    };
  },
});
