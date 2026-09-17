-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('EENMANSZAAK', 'VOF', 'CV', 'BV', 'NV', 'STICHTING', 'VERENIGING', 'COOPERATIE', 'MAATSCHAP', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyAddressType" AS ENUM ('OFFICE', 'POSTAL', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "SocialNetwork" AS ENUM ('LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'X', 'YOUTUBE', 'TIKTOK', 'OTHER');

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "legalForm" "LegalForm" NOT NULL,
    "registeredOn" DATE,
    "statutorySeat" TEXT,
    "kvkNumber" TEXT,
    "establishmentNumber" TEXT,
    "rsin" TEXT,
    "vatId" TEXT,
    "vatNumber" TEXT,
    "payrollTaxNumber" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "activityDescription" TEXT,
    "postalSameAsOffice" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyAddressType" NOT NULL,
    "name" TEXT,
    "street" TEXT,
    "houseNumber" INTEGER,
    "houseNumberAddition" TEXT,
    "postbus" TEXT,
    "postcode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'NL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyPhone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "number" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "CompanyPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySocialLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "network" "SocialNetwork" NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "CompanySocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sbiCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_singleton_key" ON "CompanyProfile"("singleton");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_type_idx" ON "CompanyAddress"("companyId", "type");

-- CreateIndex
CREATE INDEX "CompanyPhone_companyId_idx" ON "CompanyPhone"("companyId");

-- CreateIndex
CREATE INDEX "CompanySocialLink_companyId_idx" ON "CompanySocialLink"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyActivity_companyId_sbiCode_key" ON "CompanyActivity"("companyId", "sbiCode");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPhone" ADD CONSTRAINT "CompanyPhone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySocialLink" ADD CONSTRAINT "CompanySocialLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Added by hand (docs/СХЕМА-БД.md, 8.3): Prisma cannot describe these constraints.

-- The unique "singleton" column allows a single row only if its value is fixed.
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_singleton_check" CHECK ("singleton" = true);

-- At most one active office and one active postal address; warehouses are limited in Zod.
CREATE UNIQUE INDEX "CompanyAddress_companyId_type_active_key" ON "CompanyAddress"("companyId", "type")
WHERE "type" IN ('OFFICE', 'POSTAL') AND "deletedAt" IS NULL;
