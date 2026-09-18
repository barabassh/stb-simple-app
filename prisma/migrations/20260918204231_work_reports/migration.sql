-- CreateEnum
CREATE TYPE "WorkReportStatus" AS ENUM ('UNAPPROVED', 'APPROVED');

-- AlterTable
-- Added nullable and made required below, once existing users have a nickname.
ALTER TABLE "User" ADD COLUMN     "nickname" TEXT;

-- CreateTable
CREATE TABLE "WorkReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractorId" TEXT,
    "projectId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "workDescription" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "lunchMinutes" INTEGER NOT NULL DEFAULT 0,
    "mileageKm" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkReportStatus" NOT NULL DEFAULT 'UNAPPROVED',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "unapprovalReason" TEXT,
    "unapprovedAt" TIMESTAMP(3),
    "unapprovedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkReport_projectId_workDate_idx" ON "WorkReport"("projectId", "workDate");

-- CreateIndex
CREATE INDEX "WorkReport_userId_workDate_idx" ON "WorkReport"("userId", "workDate");

-- CreateIndex
CREATE INDEX "WorkReport_contractorId_workDate_idx" ON "WorkReport"("contractorId", "workDate");

-- CreateIndex
CREATE INDEX "WorkReport_status_workDate_idx" ON "WorkReport"("status", "workDate");

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_unapprovedById_fkey" FOREIGN KEY ("unapprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Added by hand (docs/СХЕМА-БД.md, 10.3): Prisma cannot describe these constraints.

-- Nicknames of the users created before stage 4, by the rule of docs/ТЗ.md, 7.4 and
-- src/features/users/nickname.ts: the first name (the second word of the full name, or its only
-- word), then "Name S." with the surname initial, "Name S. 2", "Name S. 3", ...; when the first
-- name does not fit the format, the login and "login 2", ... . Users are taken by creation time,
-- so the earlier account keeps the plain name.
DO $$
DECLARE
  nickname_format CONSTANT TEXT := '^[[:alpha:][:digit:] ._''’-]{2,40}$';
  account RECORD;
  words TEXT[];
  first_name TEXT;
  chain INTEGER;
  plain TEXT[];
  base TEXT;
  attempt INTEGER;
  candidate TEXT;
  chosen TEXT;
BEGIN
  FOR account IN SELECT "id", "login", "fullName" FROM "User" ORDER BY "createdAt", "id" LOOP
    words := regexp_split_to_array(btrim(account."fullName"), '\s+');
    first_name := CASE WHEN cardinality(words) > 1 THEN words[2] ELSE words[1] END;
    chosen := NULL;

    FOR chain IN 1..2 LOOP
      IF chain = 1 THEN
        CONTINUE WHEN first_name !~ nickname_format;
        IF cardinality(words) > 1 THEN
          base := first_name || ' ' || upper(left(words[1], 1)) || '.';
          plain := ARRAY[first_name, base];
        ELSE
          base := first_name;
          plain := ARRAY[first_name];
        END IF;
      ELSE
        base := account."login";
        plain := ARRAY[account."login"];
      END IF;

      attempt := 1;
      LOOP
        candidate := CASE
          WHEN attempt <= cardinality(plain) THEN plain[attempt]
          ELSE base || ' ' || (attempt - cardinality(plain) + 1)
        END;
        EXIT WHEN candidate !~ nickname_format;
        IF NOT EXISTS (SELECT 1 FROM "User" WHERE lower("nickname") = lower(candidate)) THEN
          chosen := candidate;
          EXIT;
        END IF;
        attempt := attempt + 1;
      END LOOP;

      EXIT WHEN chosen IS NOT NULL;
    END LOOP;

    IF chosen IS NULL THEN
      RAISE EXCEPTION 'No free nickname for user %', account."login";
    END IF;
    UPDATE "User" SET "nickname" = chosen WHERE "id" = account."id";
  END LOOP;
END $$;

ALTER TABLE "User" ALTER COLUMN "nickname" SET NOT NULL;

-- Unique ignoring case, among all users including inactive ones.
CREATE UNIQUE INDEX "User_nickname_key" ON "User" (lower("nickname"));

-- An import row finds its project by name among the projects in progress.
CREATE UNIQUE INDEX "Project_name_in_progress_key" ON "Project" (lower("name"))
  WHERE "deletedAt" IS NULL AND "status" = 'IN_PROGRESS';

-- Compares userId and workDate for equality inside the GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "WorkReport"
  -- No work across midnight: the report ends by 23:59 of its own day.
  ADD CONSTRAINT "WorkReport_time_check"
    CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1439),
  ADD CONSTRAINT "WorkReport_lunch_check"
    CHECK ("lunchMinutes" >= 0 AND "lunchMinutes" < "endMinute" - "startMinute"),
  ADD CONSTRAINT "WorkReport_mileage_check"
    CHECK ("mileageKm" BETWEEN 0 AND 2000),
  ADD CONSTRAINT "WorkReport_approved_check"
    CHECK (("status" = 'APPROVED') = ("approvedAt" IS NOT NULL)),
  ADD CONSTRAINT "WorkReport_unapproval_check"
    CHECK ("status" = 'UNAPPROVED' OR "unapprovalReason" IS NULL),
  -- Checked by the database so that two concurrent saves cannot both pass. The range is
  -- half-open, [start, end): reports that meet at 12:00 do not overlap. A deleted report frees
  -- its interval.
  ADD CONSTRAINT "WorkReport_no_overlap"
    EXCLUDE USING gist (
      "userId" WITH =,
      "workDate" WITH =,
      int4range("startMinute", "endMinute") WITH &&
    ) WHERE ("deletedAt" IS NULL);
