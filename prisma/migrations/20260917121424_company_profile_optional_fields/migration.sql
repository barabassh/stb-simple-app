-- AlterTable
ALTER TABLE "CompanyActivity" ALTER COLUMN "sbiCode" DROP NOT NULL,
ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanyAddress" ALTER COLUMN "postcode" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanyPhone" ALTER COLUMN "number" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanyProfile" ALTER COLUMN "legalForm" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanySocialLink" ALTER COLUMN "network" DROP NOT NULL,
ALTER COLUMN "url" DROP NOT NULL;
