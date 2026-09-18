import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getOwnReportBlock } from "@/features/reports/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can, REPORTS_SECTION } from "@/lib/permissions";

// Administrators and managers see every report, employees and contractors only their own
// (docs/ТЗ.md, 7.3). The registry itself comes with step 30.
export default async function ReportsPage() {
  const viewer = await requirePagePermission(REPORTS_SECTION);
  const [t, block] = await Promise.all([
    getTranslations(),
    can(viewer, "reports.writeOwn") ? getOwnReportBlock(viewer) : null,
  ]);
  const canCreate = can(viewer, "reports.write") || (can(viewer, "reports.writeOwn") && !block);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("reports.list.title")}</h1>
        {canCreate && (
          <Button asChild>
            <Link href="/reports/new">
              <PlusIcon aria-hidden />
              {t("reports.list.create")}
            </Link>
          </Button>
        )}
      </div>

      {block && (
        <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {t(block)}
        </p>
      )}

      <div className="flex h-32 items-center justify-center rounded-lg border px-4 text-center text-sm text-muted-foreground">
        {t("reports.list.empty")}
      </div>
    </div>
  );
}
