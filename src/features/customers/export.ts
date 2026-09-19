import { getTranslations } from "next-intl/server";

import { referenceStatusName } from "@/components/reference-book/status-name";
import { defineExportReport } from "@/lib/export";

import { parseCustomersListParams } from "./list-params";
import { countCustomersForExport, listCustomersForExport } from "./queries";

type CustomerExportRow = {
  name: string;
  type: string;
  kvkNumber: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
};

/** The columns of the registry (docs/ТЗ.md, 6.4). */
export const customersExport = defineExportReport<CustomerExportRow>({
  name: "customers",
  path: "/customers",
  permission: "customers.export",
  entity: "Customer",
  count: (actor, searchParams) =>
    countCustomersForExport(actor, parseCustomersListParams(searchParams)),
  async columns() {
    const t = await getTranslations("customers");
    return [
      { key: "name", header: t("columns.name") },
      { key: "type", header: t("columns.type") },
      { key: "kvkNumber", header: t("columns.kvkNumber") },
      { key: "contactPerson", header: t("columns.contactPerson") },
      { key: "phone", header: t("columns.phone") },
      { key: "email", header: t("columns.email") },
      { key: "city", header: t("columns.city") },
      { key: "status", header: t("columns.status") },
    ];
  },
  async load(actor, searchParams) {
    const [t, tAll, customers] = await Promise.all([
      getTranslations("customers"),
      getTranslations(),
      listCustomersForExport(actor, parseCustomersListParams(searchParams)),
    ]);

    return {
      title: t("export.title"),
      rows: customers.map((customer) => ({
        name: customer.name,
        type: t(`types.${customer.type}`),
        kvkNumber: customer.kvkNumber,
        contactPerson: customer.contactPerson,
        phone: customer.phone,
        email: customer.email,
        city: customer.city,
        status: referenceStatusName(customer.isActive, tAll),
      })),
    };
  },
});
