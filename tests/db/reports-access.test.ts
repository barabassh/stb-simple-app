import { describe, expect, it } from "vitest";

import { getOwnReportBlock } from "@/features/reports/queries";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import { createUser } from "./helpers";

// Who may file a report of their own (docs/ТЗ.md, 7.3; docs/ПРАВА-ДОСТУПА.md, 17).

async function contractorAccount(organisation: { isActive: boolean } | null) {
  const user = await createUser({ role: "CONTRACTOR" });
  if (organisation) {
    const { id } = await db.contractor.create({
      data: { name: "Bouwbedrijf Jansen", ...organisation },
    });
    await db.user.update({ where: { id: user.id }, data: { contractorId: id } });
  }
  return user;
}

describe("filing a report of one's own", () => {
  it("is open to an employee", async () => {
    expect(await getOwnReportBlock(await createUser({ role: "EMPLOYEE" }))).toBeNull();
  });

  it("is open to a contractor account of an active organisation", async () => {
    expect(await getOwnReportBlock(await contractorAccount({ isActive: true }))).toBeNull();
  });

  it("is closed to a contractor account without an organisation", async () => {
    expect(await getOwnReportBlock(await contractorAccount(null))).toBe(
      "reports.errors.noOrganization",
    );
  });

  it("is closed to a contractor account of an archived organisation", async () => {
    expect(await getOwnReportBlock(await contractorAccount({ isActive: false }))).toBe(
      "reports.errors.organizationArchived",
    );
  });

  it("is not asked about for a manager, who files reports for others", async () => {
    await expect(getOwnReportBlock(await createUser({ role: "MANAGER" }))).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});
