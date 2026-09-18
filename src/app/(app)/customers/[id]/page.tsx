import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ReferenceCard } from "@/components/reference-book/card";
import { changeCustomerStatus } from "@/features/customers/actions";
import { CustomerDetails } from "@/features/customers/components/customer-details";
import { getCustomer } from "@/features/customers/queries";
import { projectAccess } from "@/features/projects/columns";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { parseProjectsListParams } from "@/features/projects/list-params";
import { listProjects } from "@/features/projects/queries";
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

  // The registry's own query, narrowed to the customer: every status, paged and sorted in the URL
  // like any table. The tabs do not share parameters, since switching a tab drops them.
  const projectsParams = {
    ...parseProjectsListParams(resolvedSearchParams, projectAccess(viewer)),
    query: "",
    status: "all",
    customerId: customer.id,
  } as const;
  const [projects, t] = await Promise.all([
    listProjects(viewer, projectsParams),
    getTranslations("customers"),
  ]);

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
          content: (
            <ProjectsTable
              rows={projects.rows}
              rowCount={projects.rowCount}
              state={projectsParams.table}
              columns={["number", "name", "startDate", "status"]}
              emptyState={t("card.projectsEmpty")}
            />
          ),
        },
      ]}
    />
  );
}
