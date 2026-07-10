-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "patientsLeft" INTEGER,
ADD COLUMN     "patientsSource" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "statusUpdatedById" TEXT,
ADD COLUMN     "statusUpdatedByName" TEXT,
ADD COLUMN     "statusUpdatedByRole" TEXT,
ALTER COLUMN "status" SET DEFAULT 'available';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "mrId" TEXT,
ADD COLUMN     "mrName" TEXT;

-- CreateTable
CREATE TABLE "DoctorUpdate" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "role" TEXT,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorUpdate_doctorId_idx" ON "DoctorUpdate"("doctorId");

-- AddForeignKey
ALTER TABLE "DoctorUpdate" ADD CONSTRAINT "DoctorUpdate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

