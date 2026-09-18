import { getTranslations } from "next-intl/server";

import { referenceStatusName } from "@/components/reference-book/status-name";
import { defineExportReport } from "@/lib/export";

import { parseContractorsListParams } from "./list-params";
import { listContractorsForExport } from "./queries";

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
  async load(actor, searchParams) {
    const [t, tAll, contractors] = await Promise.all([
      getTranslations("contractors"),
      getTranslations(),
      listContractorsForExport(actor, parseContractorsListParams(searchParams)),
    ]);

    return {
      title: t("export.title"),
      columns: [
        { key: "name", header: t("columns.name") },
        { key: "kvkNumber", header: t("columns.kvkNumber") },
        { key: "contactPerson", header: t("columns.contactPerson") },
        { key: "phone", header: t("columns.phone") },
        { key: "email", header: t("columns.email") },
        { key: "city", header: t("columns.city") },
        { key: "status", header: t("columns.status") },
      ],
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
