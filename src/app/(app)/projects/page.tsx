import { getTranslations } from "next-intl/server";

import { requirePagePermission } from "@/lib/auth/current-user";

// The registry itself arrives in step 21; a contractor reaches the section with projects.readActive.
export default async function ProjectsPage() {
  await requirePagePermission("projects.readActive");
  const t = await getTranslations("projects.list");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
    </div>
  );
}
