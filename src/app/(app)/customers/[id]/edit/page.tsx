import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomer } from "@/features/customers/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const viewer = await requirePagePermission("customers.update");
  const { id } = await params;

  const customer = await getCustomer(viewer, id);
  if (!customer) notFound();

  const t = await getTranslations("customers.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/customers/${customer.id}`} label={t("backToCustomer")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("editTitle")}</h1>
        <p className="break-words text-muted-foreground">{customer.name}</p>
      </div>
      <CustomerForm customer={customer} />
    </div>
  );
}
