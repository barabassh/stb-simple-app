-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('COMPANY', 'PERSON');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "VatRate" AS ENUM ('STANDARD_21', 'REDUCED_9', 'ZERO', 'REVERSE_CHARGE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contractorId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "kvkNumber" TEXT,
    "vatId" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "houseNumber" INTEGER,
    "houseNumberAddition" TEXT,
    "postcode" TEXT,
    "city" TEXT,
    "country" CHAR(2),
    "comment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalForm" "LegalForm",
    "kvkNumber" TEXT,
    "vatId" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "street" TEXT,
    "houseNumber" INTEGER,
    "houseNumberAddition" TEXT,
    "postcode" TEXT,
    "city" TEXT,
    "country" CHAR(2),
    "comment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" INTEGER NOT NULL,
    "houseNumberAddition" TEXT,
    "postcode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'NL',
    "startDate" DATE NOT NULL,
    "description" TEXT,
    "budgetAmount" DECIMAL(14,2),
    "vatRate" "VatRate",
    "budgetHours" DECIMAL(10,2),
    "status" "ProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_kvkNumber_key" ON "Customer"("kvkNumber");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_kvkNumber_key" ON "Contractor"("kvkNumber");

-- CreateIndex
CREATE INDEX "Contractor_name_idx" ON "Contractor"("name");

-- CreateIndex
CREATE INDEX "Contractor_isActive_idx" ON "Contractor"("isActive");

-- CreateIndex
CREATE INDEX "Project_status_startDate_idx" ON "Project"("status", "startDate");

-- CreateIndex
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE INDEX "User_contractorId_idx" ON "User"("contractorId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Added by hand (docs/СХЕМА-БД.md, 9.3): Prisma cannot describe these constraints.

-- A private customer has no company numbers and no contact person.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_person_fields_check"
CHECK ("type" = 'COMPANY' OR ("kvkNumber" IS NULL AND "vatId" IS NULL AND "contactPerson" IS NULL));

-- A budget is meaningless without the VAT rate its amount is quoted without.
ALTER TABLE "Project" ADD CONSTRAINT "Project_budget_vat_rate_check"
CHECK ("budgetAmount" IS NULL OR "vatRate" IS NOT NULL);

-- The closing time is stored exactly for a closed project.
ALTER TABLE "Project" ADD CONSTRAINT "Project_closed_at_check"
CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- The number is unique among the projects that are not deleted, ignoring case;
-- a deleted project frees its number.
CREATE UNIQUE INDEX "Project_number_active_key" ON "Project" (lower("number")) WHERE "deletedAt" IS NULL;
