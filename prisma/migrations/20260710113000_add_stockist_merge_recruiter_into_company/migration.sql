-- Role update: add STOCKIST; delete RECRUITER (merged into PHARMA_COMPANY).

-- 1) Move every recruiter account under Company before the enum changes.
UPDATE "User" SET "role" = 'PHARMA_COMPANY' WHERE "role" = 'RECRUITER';

-- 2) Rebuild the enum without RECRUITER and with STOCKIST.
CREATE TYPE "Role_new" AS ENUM ('MEDICAL_REP', 'DOCTOR', 'CLINIC_STAFF', 'CHEMIST', 'STOCKIST', 'PHARMA_COMPANY', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
