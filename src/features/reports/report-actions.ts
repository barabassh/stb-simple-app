import type { WorkReportStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export type ReportActionTarget = {
  status: WorkReportStatus;
  project: { inProgress: boolean };
};

export type AvailableReportActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  unapprove: boolean;
};

/**
 * The buttons a report offers its reader (docs/ТЗ.md, 7.7–7.8): nothing in a closed project; a
 * worker edits and deletes only an unapproved report, an administrator or a manager edits an
 * approved one too, and nobody deletes it. A reader without reports.read sees only their own
 * reports, so the report is theirs. The actions check all of it again.
 */
export function availableReportActions(
  viewer: Pick<SessionUser, "role">,
  report: ReportActionTarget,
): AvailableReportActions {
  const open = report.project.inProgress;
  const unapproved = report.status === "UNAPPROVED";
  const manage = can(viewer, "reports.write");
  const own = can(viewer, "reports.writeOwn");
  const approve = can(viewer, "reports.approve");

  return {
    edit: open && (manage || (own && unapproved)),
    delete: open && unapproved && (manage || own),
    approve: open && approve && unapproved,
    unapprove: open && approve && !unapproved,
  };
}
