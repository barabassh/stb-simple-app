import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

/**
 * Why the user may not file a report of their own: a contractor account files reports on behalf of
 * an active organisation (docs/ТЗ.md, 7.3). Null when nothing stands in the way. The key is the
 * message shown instead of the "Новый отчёт" button and returned by the action that refuses it.
 */
export type OwnReportBlock =
  "reports.errors.noOrganization" | "reports.errors.organizationArchived";

export async function getOwnReportBlock(actor: SessionUser): Promise<OwnReportBlock | null> {
  requirePermission(actor, "reports.writeOwn");
  if (actor.role !== "CONTRACTOR") return null;

  const { contractor } = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { contractor: { select: { isActive: true } } },
  });
  if (!contractor) return "reports.errors.noOrganization";
  return contractor.isActive ? null : "reports.errors.organizationArchived";
}
