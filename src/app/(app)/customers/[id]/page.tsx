import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ReferenceCard } from "@/components/reference-book/card";
import { changeCustomerStatus } from "@/features/customers/actions";
import { CustomerDetails } from "@/features/customers/components/customer-details";
import { getCustomer } from "@/features/customers/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type CustomerPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerPage({ params, searchParams }: CustomerPageProps) {
  const viewer = await requirePagePermission("customers.read");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const customer = await getCustomer(viewer, id);
  if (!customer) notFound();

  const t = await getTranslations("customers");

  return (
    <ReferenceCard
      section="customers"
      entity="Customer"
      viewer={viewer}
      record={customer}
      subtitle={t(`types.${customer.type}`)}
      changeStatus={changeCustomerStatus}
      searchParams={resolvedSearchParams}
      details={<CustomerDetails customer={customer} />}
      tabs={[
        {
          value: "projects",
          label: t("card.tabs.projects"),
          // The list of projects arrives with the registry of projects (step 21).
          content: (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              {t("card.projectsEmpty")}
            </p>
          ),
        },
      ]}
    />
  );
}
