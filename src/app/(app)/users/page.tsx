import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref } from "@/components/data-table/search-params";
import { ExportButtons } from "@/components/export/export-buttons";
import { Button } from "@/components/ui/button";
import { UsersTable } from "@/features/users/components/users-table";
import { UsersToolbar } from "@/features/users/components/users-toolbar";
import { usersExport } from "@/features/users/export";
import { hasUserFilters, parseUsersListParams } from "@/features/users/list-params";
import { listUsers } from "@/features/users/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type UsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const viewer = await requirePagePermission("users.read");
  const t = await getTranslations("users.list");

  const resolvedSearchParams = await searchParams;
  const params = parseUsersListParams(resolvedSearchParams);
  const { rows, rowCount } = await listUsers(viewer, params);

  const emptyState = hasUserFilters(params) ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref("/users", resolvedSearchParams)}>{t("resetFilters")}</Link>
      </Button>
    </div>
  ) : rowCount === 0 ? (
    t("empty")
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {can(viewer, usersExport.permission) && (
            <ExportButtons report={usersExport} searchParams={resolvedSearchParams} />
          )}
          {can(viewer, "users.create") && (
            <Button asChild>
              <Link href="/users/new">
                <UserPlusIcon aria-hidden />
                {t("create")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <UsersToolbar query={params.query} roles={params.roles} status={params.status} />
      <UsersTable
        rows={rows}
        rowCount={rowCount}
        state={params.table}
        emptyState={emptyState}
        viewer={viewer}
      />
    </div>
  );
}
