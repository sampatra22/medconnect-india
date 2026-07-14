-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "addedByName" TEXT,
ADD COLUMN     "addedByRole" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Doctor_verified_idx" ON "Doctor"("verified");
