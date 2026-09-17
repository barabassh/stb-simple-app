import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const stampAuthor = { select: { fullName: true, login: true } } as const;

/**
 * The company profile with its lists in the order they were entered; null until it is filled.
 * Without a permission check: for an action that has already checked its own.
 */
export function findCompanyProfile() {
  // Not findUnique: Prisma batches concurrent findUnique calls into one query with "in", which
  // the boolean singleton does not accept.
  return db.companyProfile.findFirst({
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

export async function getCompanyProfile(actor: SessionUser) {
  requirePermission(actor, "settings.company.read");
  return findCompanyProfile();
}

export type CompanyProfileDetails = NonNullable<Awaited<ReturnType<typeof getCompanyProfile>>>;

/** The id the history of the profile is logged under; null until it is filled. */
export async function getCompanyProfileId(actor: SessionUser): Promise<string | null> {
  requirePermission(actor, "settings.company.history");
  const profile = await db.companyProfile.findFirst({
    where: { singleton: true },
    select: { id: true },
  });
  return profile?.id ?? null;
}
