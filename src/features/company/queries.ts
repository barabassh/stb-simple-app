import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const stampAuthor = { select: { fullName: true, login: true } } as const;

/** The company profile with its lists in the order they were entered; null until it is filled. */
export async function getCompanyProfile(actor: SessionUser) {
  requirePermission(actor, "settings.company.read");

  return db.companyProfile.findUnique({
    where: { singleton: true },
    include: {
      createdBy: stampAuthor,
      updatedBy: stampAuthor,
      addresses: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      phones: { orderBy: { sortOrder: "asc" } },
      socialLinks: { orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export type CompanyProfileDetails = NonNullable<Awaited<ReturnType<typeof getCompanyProfile>>>;
