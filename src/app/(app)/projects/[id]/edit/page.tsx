import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { listCustomerOptions } from "@/features/customers/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getProjectForEdit } from "@/features/projects/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type EditProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const viewer = await requirePagePermission("projects.update");
  const { id } = await params;

  const project = await getProjectForEdit(viewer, id);
  if (!project) notFound();

  const [customers, t] = await Promise.all([
    project.status === "IN_PROGRESS" ? listCustomerOptions(viewer, project.customerId) : [],
    getTranslations("projects.form"),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/projects/${project.id}`} label={t("backToProject")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("editTitle")}</h1>
        <p className="break-words text-muted-foreground">
          {project.number} · {project.name}
        </p>
      </div>
      {/* The server refuses the save anyway; the form is not offered for a closed project. */}
      {project.status === "IN_PROGRESS" ? (
        <ProjectForm project={project} customers={customers} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("closedMessage")}</p>
          <Button variant="link" asChild>
            <Link href={`/projects/${project.id}`}>{t("backToProject")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
